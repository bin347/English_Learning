const sources = [
  {id:'china-daily',name:'中国日报',url:'https://www.chinadaily.com.cn/china',host:'www.chinadaily.com.cn',article:/^\/a\/20\d{2}(?:0[1-9]|1[0-2])\/\d{2}\/WS[\da-f]+\.html$/i},
  {id:'xinhua',name:'新华社英文网',url:'https://english.news.cn/china/',host:'english.news.cn',article:/^\/20\d{6}\/[\da-f]+\/c\.html$/i},
  {id:'global-voices',name:'Global Voices · 中国',url:'https://globalvoices.org/-/world/east-asia/china/',feed:'https://globalvoices.org/-/world/east-asia/china/feed/',host:'globalvoices.org',article:/^\/20\d{2}\/(?:0[1-9]|1[0-2])\/\d{2}\/[a-z0-9-]+\/$/i}
];

function decode(text) {
  return text.replace(/&#(\d+);/g,(_,number)=>String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi,(_,number)=>String.fromCodePoint(parseInt(number,16)))
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp|ldquo|rdquo|lsquo|rsquo|mdash|ndash|hellip);/g,entity=>({ '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' ','&ldquo;':'“','&rdquo;':'”','&lsquo;':'‘','&rsquo;':'’','&mdash;':'—','&ndash;':'–','&hellip;':'…' })[entity]);
}

export function parseNewsLinks(html,source) {
  const results=[], seen=new Set();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href=/\bhref\s*=\s*(["'])(.*?)\1/i.exec(match[1])?.[2];
    if (!href) continue;
    let address;
    try { address=new URL(href,source.url); } catch { continue; }
    if (address.hostname!==source.host || !source.article.test(address.pathname)) continue;
    const title=decode(match[2].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
    if (title.length<12 || seen.has(address.href)) continue;
    seen.add(address.href);
    const date=source.id==='china-daily' ? /\/a\/(20\d{2})(\d{2})\/(\d{2})\//.exec(address.pathname) : source.id==='xinhua' ? /\/(20\d{2})(\d{2})(\d{2})\//.exec(address.pathname) : /\/(20\d{2})\/(\d{2})\/(\d{2})\//.exec(address.pathname);
    results.push({id:address.href,title,url:address.href,source:source.name,sourceId:source.id,readable:source.id==='global-voices',publishedAt:date?`${date[1]}-${date[2]}-${date[3]}`:'',summary:''});
  }
  return results;
}

function feedItems(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(([,item])=>{
    const value=name=>(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,'i').exec(item)?.[1]||'').replace(/^<!\[CDATA\[|\]\]>$/g,'').trim();
    const field=name=>decode(value(name));
    let address;
    try { address=new URL(field('link')); } catch { return []; }
    const source=sources.find(entry=>entry.id==='global-voices');
    if (address.protocol!=='https:' || address.hostname!==source.host || !source.article.test(address.pathname)) return [];
    const title=field('title'),author=field('dc:creator'),date=Date.parse(field('pubDate'));
    if (!title || !author || !Number.isFinite(date)) return [];
    return [{id:address.href,title,url:address.href,source:source.name,sourceId:source.id,readable:true,publishedAt:new Date(date).toISOString().slice(0,10),summary:'',author,html:value('content:encoded')}];
  });
}

export async function handleNewsApi(req,res,url,{send,newsFetch}) {
  if (url.pathname==='/api/news/article' && req.method==='GET') {
    const source=sources.find(item=>item.id==='global-voices');
    let address;
    try { address=new URL(url.searchParams.get('url')); } catch { send(res,400,{error:'新闻链接无效'}); return true; }
    if (address.protocol!=='https:' || address.hostname!==source.host || address.port || !source.article.test(address.pathname)) {
      send(res,400,{error:'仅支持已开放全文使用许可的新闻来源'}); return true;
    }
    let article=null;
    try {
      const response=await newsFetch(source.feed,{signal:AbortSignal.timeout(12000),redirect:'error'});
      if (response.ok) {
        const item=feedItems(await response.text()).find(item=>item.url===address.href);
        if (item?.html) article=parseGlobalVoicesArticle(item.html,address.href,{title:item.title,author:item.author});
      }
    } catch {}
    if (!article) {
      try {
        const response=await newsFetch(address.href,{signal:AbortSignal.timeout(12000),redirect:'error'});
        if (response.ok) article=parseGlobalVoicesArticle(await response.text(),address.href);
      } catch {}
    }
    if (!article) send(res,502,{error:'无法从这篇新闻提取完整正文，请打开原站阅读'});
    else send(res,200,article);
    return true;
  }
  if (url.pathname!=='/api/news' || req.method!=='GET') return false;
  const sourceId=url.searchParams.get('source')||'', query=(url.searchParams.get('q')||'').trim().toLowerCase();
  if ((sourceId && !sources.some(source=>source.id===sourceId)) || query.length>100) {
    send(res,400,{error:'新闻来源或搜索内容无效'}); return true;
  }
  const selected=sources.filter(source=>!sourceId||source.id===sourceId);
  const outcomes=await Promise.allSettled(selected.map(async source=>{
    const response=await newsFetch(source.feed||source.url,{signal:AbortSignal.timeout(10000),redirect:'error'});
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const html=await response.text();
    return source.feed?feedItems(html).map(({html,...item})=>item):parseNewsLinks(html,source);
  }));
  const failed=outcomes.filter(outcome=>outcome.status==='rejected').length;
  const results=outcomes.flatMap(outcome=>outcome.status==='fulfilled'?outcome.value.filter(article=>!query||article.title.toLowerCase().includes(query)).slice(0,sourceId?60:20):[]);
  send(res,200,{sources:sources.map(({id,name,url})=>({id,name,url})),results,warning:failed===selected.length?'新闻来源暂时无法连接，可以打开新闻网站阅读。':failed?`${failed} 个新闻来源暂时无法连接，已显示其他来源。`:''});
  return true;
}

export function parseGlobalVoicesArticle(html,url,feed={}) {
  const article=feed.title?html:/<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1];
  if (!article) return null;
  const cleaned=article.replace(/<(blockquote|figure|figcaption|iframe|video|audio|script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const paragraphs=[...cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([,value])=>decode(value.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim())
    .filter(value=>value.length>25);
  if (paragraphs.join(' ').length<300) return null;
  const metadata=(key)=>decode(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["']`,'i').exec(html)?.[1]||'');
  const heading=/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(article)?.[1]||'';
  const title=feed.title||decode(heading.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()||metadata('og:title');
  const author=feed.author||metadata('author')||decode(/\bclass=["'][^"']*author[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(article)?.[1]?.replace(/<[^>]*>/g,' ')||'').trim();
  if (!title || !author) return null;
  const date=/\/(20\d{2})\/(\d{2})\/(\d{2})\//.exec(new URL(url).pathname);
  return {title,url,source:'Global Voices · 中国',sourceId:'global-voices',publishedAt:date?`${date[1]}-${date[2]}-${date[3]}`:'',author,text:paragraphs.join('\n\n'),license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',changes:'仅保留正文段落，移除引文与媒体内容'};
}
