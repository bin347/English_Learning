import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { vocabularyFromSubtitles } from './subtitle-vocabulary.mjs';
export { parseSubtitles, vocabularyFromSubtitles } from './subtitle-vocabulary.mjs';

const classics = [
  [1342,'Pride and Prejudice','傲慢与偏见','Jane Austen'],
  [11,"Alice’s Adventures in Wonderland",'爱丽丝梦游仙境','Lewis Carroll'],
  [1661,'The Adventures of Sherlock Holmes','福尔摩斯探案集','Arthur Conan Doyle'],
  [84,'Frankenstein','弗兰肯斯坦','Mary Shelley'],
  [2701,'Moby Dick; or, The Whale','白鲸','Herman Melville'],
  [98,'A Tale of Two Cities','双城记','Charles Dickens'],
  [74,'The Adventures of Tom Sawyer','汤姆索亚历险记','Mark Twain'],
  [76,'Adventures of Huckleberry Finn','哈克贝利费恩历险记','Mark Twain'],
  [120,'Treasure Island','金银岛','Robert Louis Stevenson'],
  [174,'The Picture of Dorian Gray','道林格雷的画像','Oscar Wilde'],
  [345,'Dracula','德古拉','Bram Stoker'],
  [1260,'Jane Eyre','简爱','Charlotte Brontë'],
  [768,'Wuthering Heights','呼啸山庄','Emily Brontë'],
  [514,'Little Women','小妇人','Louisa May Alcott'],
  [55,'The Wonderful Wizard of Oz','绿野仙踪','L. Frank Baum'],
].map(([id,title,alias,author])=>({id,title,alias,author,source:'Project Gutenberg',cover:`https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`}));

const mediaSources = [
  {id:'360',name:'360',url:'https://360zy.com/api.php/provide/vod'},
  {id:'guangsu',name:'光速',url:'https://api.guangsuapi.com/api.php/provide/vod'},
  {id:'baofeng',name:'暴风',url:'https://bfzyapi.com/api.php/provide/vod'},
  {id:'zuid',name:'最大',url:'https://api.zuidapi.com/api.php/provide/vod'}
];

async function remote(url, json=true, timeout=20000) {
  let response;
  try { response = await fetch(url, {signal:AbortSignal.timeout(timeout)}); }
  catch { throw new Error('无法连接内容来源，请检查网络或稍后重试；影视搜索也可在设置中更换数据源。'); }
  if(!response.ok) throw new Error(`内容服务返回 ${response.status}，请稍后再试`);
  return json ? response.json() : response.text();
}


let dictionaryPromise, bookCatalogPromise;
const bookCatalog = () => bookCatalogPromise ??= readFile(new URL('../data/gutenberg-catalog.json',import.meta.url),'utf8').then(JSON.parse);
export async function handleContentApi(req,res,url,{readBody,send,db,save}) {
  const path=url.pathname;
  if(path==='/api/catalog'&&req.method==='GET') {
    const q=(url.searchParams.get('q')||'').trim();
    const local=classics.filter(b=>!q||`${b.title} ${b.alias} ${b.author}`.toLowerCase().includes(q.toLowerCase()));
    if (!q) {send(res,200,{results:local,count:local.length,source:'内置经典目录'});return true;}
    const catalog=await bookCatalog(), query=q.toLowerCase();
    const snapshot=catalog.filter(([,title,author])=>`${title} ${author}`.toLowerCase().includes(query)).slice(0,40).map(([id,title,author])=>({id,title,author,source:'Project Gutenberg · 本地书目'}));
    let online=[],warning='';
    try {const data=await remote(`https://gutendex.com/books/?languages=en&copyright=false&search=${encodeURIComponent(q)}`,true,4000);online=data.results.map(b=>({id:b.id,title:b.title,author:b.authors.map(a=>a.name).join(', '),cover:b.formats['image/jpeg'],source:'Project Gutenberg · 在线目录'}));}
    catch {warning='在线目录暂不可用，已显示本地书目；下载正文仍需联网。';}
    const results=[...local,...online,...snapshot].filter((item,i,all)=>all.findIndex(other=>other.id===item.id)===i);
    send(res,200,{results,count:results.length,source:'Project Gutenberg',warning});return true;
  }
  if(path==='/api/catalog/import'&&req.method==='POST') {
    const body=await readBody(req), id=body.id;
    if(!Number.isInteger(Number(id))||Number(id)<1)throw new Error('书籍编号无效');
    const existing=db.books.find(book=>book.catalogId===Number(id));
    if(existing){send(res,200,existing);return true;}
    const number=Number(id), bookNumber=String(number), catalog=await bookCatalog();
    const saved=catalog.find(([itemId])=>itemId===number);
    let metadata=classics.find(book=>book.id===number)||(saved&&{title:saved[1],author:saved[2]});
    if(!metadata && typeof body.title==='string' && body.title.trim()) metadata={title:body.title.trim().slice(0,500),author:typeof body.author==='string'?body.author.slice(0,500):''};
    if(!metadata){
      try {const found=await remote(`https://gutendex.com/books/${bookNumber}`,true,6000);metadata={title:found.title,author:found.authors.map(a=>a.name).join(', ')};}
      catch {throw new Error('无法获取书籍详情，请检查网络后重试。');}
    }
    const directory=(bookNumber.length===1?'0':bookNumber.slice(0,-1).split('').join('/'))+'/'+bookNumber;
    const urls=[`https://www.gutenberg.org/cache/epub/${bookNumber}/pg${bookNumber}.txt`,`https://www.gutenberg.org/files/${bookNumber}/${bookNumber}-0.txt`,`https://gutenberg.pglaf.org/${directory}/${bookNumber}-0.txt`];
    let text;
    for (const address of urls) {
      try { const value=await remote(address,false,8000); if(value.trim()&&!/^\s*(?:<!doctype html|<html)/i.test(value)) {text=value;break;} } catch {}
    }
    if(!text) throw new Error('各正文下载地址均不可用，请检查网络或稍后重试。');
    const book={id:randomUUID(),catalogId:number,title:metadata.title,author:metadata.author,text,format:'text',source:`Project Gutenberg #${id}`,sourceUrl:`https://www.gutenberg.org/ebooks/${id}`,progress:0,location:0,createdAt:new Date().toISOString()};
    db.books.push(book);await save();send(res,201,book);return true;
  }
  if(path==='/api/media/search'&&req.method==='GET') {
    const q=(url.searchParams.get('q')||'').trim();
    if(url.searchParams.get('source')!=='archive') {
      const custom=db.settings.mediaApi && !mediaSources.some(source=>source.url===db.settings.mediaApi);
      const sources=custom?[{id:'custom',name:'自定义',url:db.settings.mediaApi}]:mediaSources;
      const type=url.searchParams.get('type')||'all', country=url.searchParams.get('country')||'all', language=url.searchParams.get('language')||'英语';
      if(!['all','movie','tv'].includes(type)) throw new Error('影视类型无效');
      const outcomes=await Promise.allSettled(sources.map(async source=>{
        const endpoint=new URL(source.url), categories=await remote(new URL('?ac=list',endpoint));
        const classes=categories.class||[];
        const movieRoot=Number(classes.find(c=>['电影','电影片'].includes(c.type_name))?.type_id||1);
        const tvRoot=Number(classes.find(c=>['电视剧','连续剧'].includes(c.type_name))?.type_id||2);
        const movieTypes=new Set(classes.filter(c=>Number(c.type_pid)===movieRoot).map(c=>c.type_name));
        const tvTypes=new Set(classes.filter(c=>Number(c.type_pid)===tvRoot).map(c=>c.type_name));
        const requests=q?[null]:classes.filter(c=>(type!=='tv'&&Number(c.type_pid)===movieRoot)||(type!=='movie'&&c.type_name==='欧美剧')).map(c=>c.type_id);
        const pages=await Promise.all(requests.map(async category=>{const query=new URL(endpoint);query.searchParams.set('ac','detail');if(q)query.searchParams.set('wd',q);if(category)query.searchParams.set('t',category);return remote(query);}));
        return pages.flatMap(data=>data.list||[]).filter(item=>{
          const kind=movieTypes.has(item.type_name)?'movie':tvTypes.has(item.type_name)?'tv':'';
          return kind && (type==='all'||type===kind) && (country==='all'||String(item.vod_area||'').includes(country)) && (language==='all'||String(item.vod_lang||'').includes(language));
        }).map(item=>({id:String(item.vod_id),title:item.vod_name,cover:item.vod_pic,description:item.vod_remarks,provider:'cms',source:endpoint.origin,sourceId:source.id,sourceName:source.name,type:movieTypes.has(item.type_name)?'movie':'tv',country:item.vod_area||'',language:item.vod_lang||''}));
      }));
      const results=outcomes.flatMap(result=>result.status==='fulfilled'?result.value:[]);
      const failed=outcomes.filter(result=>result.status==='rejected').length;
      if(failed===sources.length) throw new Error('无法连接影视数据源，请检查网络或稍后重试。');
      send(res,200,{results,warning:failed?`${failed} 个影视源暂时无法连接，已显示其余来源。`:''});return true;
    }
    const query=`collection:feature_films AND mediatype:movies${q?' AND title:('+q.replace(/["():]/g,' ')+')':''}`;
    const endpoint=new URL('https://archive.org/advancedsearch.php');endpoint.searchParams.set('q',query);endpoint.searchParams.set('output','json');endpoint.searchParams.set('rows','24');
    for(const field of ['identifier','title','description'])endpoint.searchParams.append('fl[]',field);
    const data=await remote(endpoint);
    send(res,200,{results:data.response.docs.map(item=>({id:item.identifier,title:item.title,description:String(item.description||'').replace(/<[^>]*>/g,'').slice(0,160),cover:`https://archive.org/services/img/${item.identifier}`,provider:'archive',source:'Internet Archive 经典电影'}))});return true;
  }
  if(path==='/api/media/categories'&&req.method==='GET') {
    send(res,200,{types:[{value:'all',label:'全部类型'},{value:'movie',label:'电影'},{value:'tv',label:'剧集'}],countries:[{value:'all',label:'全部地区'},...['美国','英国','加拿大','澳大利亚'].map(value=>({value,label:value}))],languages:[{value:'英语',label:'英语'},{value:'all',label:'全部语言'}]});return true;
  }
  if(path==='/api/media/resolve') {
    const body=req.method==='POST'?await readBody(req):Object.fromEntries(url.searchParams);const id=String(body.id||'');
    if(!/^[\w.-]+$/.test(id))throw new Error('影片编号无效');
    if(body.provider!=='archive') {
      const source=mediaSources.find(source=>source.id===body.sourceId); const endpoint=new URL(source?.url||db.settings.mediaApi||mediaSources[0].url);endpoint.searchParams.set('ac','detail');endpoint.searchParams.set('ids',id);
      const data=await remote(endpoint);const movie=data.list?.[0];if(!movie)throw new Error('影片不存在');
      const names=(movie.vod_play_from||'').split('$$$');
      const episodes=(movie.vod_play_url||'').split('$$$').flatMap((group,index)=>group.split('#').flatMap(part=>{const split=part.indexOf('$');if(split<0)return [];const link=part.slice(split+1);if(!/^https?:\/\//.test(link))return [];const pathname=new URL(link).pathname.toLowerCase(),direct=/\.(m3u8|mp4|webm)$/.test(pathname);const label=part.slice(0,split);return [{title:`${index+1}线${names[index]?' · '+names[index]:''} · ${label}${direct?'':' · 非直链'}`,label,url:link,direct}];})).sort((a,b)=>Number(b.direct)-Number(a.direct));
      const imdbId = [movie.vod_imdb_id,movie.imdb_id].map(String).find(value=>/^tt\d{5,12}$/.test(value));
      const year = Number(movie.vod_year) || undefined;
      const originalTitle = String(movie.vod_sub || '').split(/[/／]/).map(item=>item.trim())
        .find(item=>/^[a-z0-9][a-z0-9 &.,!?'():-]{2,100}$/i.test(item) && /[a-z]{2}/i.test(item));
      send(res,200,{title:movie.vod_name,originalTitle,year,imdbId,episodes,subtitles:[],source:source?.name||'自定义影视源'});return true;
    }
    const data=await remote(`https://archive.org/metadata/${id}`);
    const fileUrl=name=>`https://archive.org/download/${id}/${name.split('/').map(encodeURIComponent).join('/')}`;
    const files=data.files||[];
    send(res,200,{title:data.metadata?.title||id,year:Number(data.metadata?.year)||undefined,episodes:files.filter(f=>/\.mp4$/i.test(f.name)&&!f.private).map(f=>({title:f.name,url:fileUrl(f.name)})).slice(0,12),subtitles:files.filter(f=>/\.(srt|vtt)$/i.test(f.name)&&!f.private).map(f=>({name:f.name,url:fileUrl(f.name),language:f.language})),source:`https://archive.org/details/${id}`});return true;
  }
  if(path==='/api/media/subtitle'&&req.method==='GET') {
    const endpoint=new URL(url.searchParams.get('url'));
    if(endpoint.hostname!=='archive.org'||!endpoint.pathname.startsWith('/download/'))throw new Error('仅支持此目录提供的字幕地址');
    send(res,200,{subtitle:await remote(endpoint,false)});return true;
  }
  if(path==='/api/media/vocabulary'&&req.method==='POST') {
    const body=await readBody(req);if(typeof body.subtitle!=='string'||body.subtitle.length>2000000)throw new Error('请输入有效 SRT 或 VTT 字幕');
    dictionaryPromise??=readFile(new URL('../data/dictionary.json',import.meta.url),'utf8').then(JSON.parse).then(dictionary=>{for(const entry of Object.values(dictionary))entry.meanings=entry.meanings.flatMap(meaning=>meaning.replaceAll('\\r','').split('\\n'));return dictionary;});
    const progress=Object.values(db.wordProgress||{});
    const result=vocabularyFromSubtitles(body.subtitle,await dictionaryPromise,progress.filter(w=>w.status==='mastered').map(w=>w.word),Math.max(1,Math.min(100,Number(body.limit)||20)),[...progress.filter(w=>w.status==='learning').map(w=>w.word),...(db.words||[]).filter(w=>w.status!=='mastered').map(w=>w.word)]);
    send(res,200,result);return true;
  }
  return false;
}
