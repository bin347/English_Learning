const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';
const bingPageUrl = 'https://cn.bing.com/translator';

function chunks(text, limit) {
  const result = [];
  for (let start=0; start<text.length;) {
    let end = Math.min(start+limit,text.length);
    if (end<text.length) {
      const space = text.lastIndexOf(' ',end-1);
      if (space>start) end=space+1;
    }
    result.push(text.slice(start,end));
    start=end;
  }
  return result;
}

// Independent clients for the public Bing and Yandex web translation protocols.
// Temporary website credentials stay in memory; no user API key is needed.
export function createWebTranslators(request = fetch) {
  let bingAuth, yandexSession;
  return {
    async bing(text) {
      const signal = AbortSignal.timeout(20000);
      if (!bingAuth || bingAuth.expiresAt<=Date.now()) {
        const page = await request(bingPageUrl,{headers:{'User-Agent':userAgent},signal});
        if (!page.ok) throw new Error('Bing 翻译页面无法访问');
        // Electron's net.fetch can return an empty response.url; start at the
        // regional host directly so its translation POST uses the same host.
        const pageUrl = new URL(page.url || bingPageUrl);
        if (pageUrl.protocol!=='https:' || !/(^|\.)bing\.com$/.test(pageUrl.hostname)) throw new Error('Bing 翻译页面地址无效');
        const html = await page.text();
        const params = html.match(/params_AbusePreventionHelper\s*=\s*(\[[^\]]+\])/);
        const ig = html.match(/IG\s*:\s*"([^"]+)"/), iid = html.match(/data-iid\s*=\s*"([^"]+)"/);
        if (!params || !ig || !iid) throw new Error('Bing 翻译页面格式已变化');
        const [key,token,lifetime] = JSON.parse(params[1]);
        if (typeof key!=='number' || typeof token!=='string' || !token || typeof lifetime!=='number' || !Number.isFinite(lifetime) || lifetime<=0) throw new Error('Bing 翻译会话无效');
        const target = new URL('/ttranslatev3',pageUrl);
        target.search = new URLSearchParams({isVertical:'1',IG:ig[1],IID:iid[1]}).toString();
        bingAuth={key:String(key),token,target,referer:pageUrl.href,expiresAt:Date.now()+lifetime};
      }
      const translated = [];
      for (const part of chunks(text,1000)) {
        const response = await request(bingAuth.target,{method:'POST',headers:{'User-Agent':userAgent,'Content-Type':'application/x-www-form-urlencoded',Referer:bingAuth.referer},body:new URLSearchParams({fromLang:'en',text:part,to:'zh-Hans',key:bingAuth.key,token:bingAuth.token}).toString(),signal});
        if (!response.ok) throw new Error('Bing 翻译请求失败');
        const result = await response.json(), value = result?.[0]?.translations?.[0]?.text;
        if ((result.statusCode!==undefined && result.statusCode!==200) || typeof value!=='string' || !value.trim()) { bingAuth=undefined; throw new Error('Bing 翻译未返回有效译文'); }
        translated.push(value);
      }
      return translated.join('');
    },
    async yandex(text) {
      const signal = AbortSignal.timeout(20000);
      const origin = 'https://translate.yandex.ru';
      const headers = {'User-Agent':userAgent,'Content-Type':'application/x-www-form-urlencoded',Origin:origin,Referer:origin+'/'};
      const common = {srv:'tr-text',yu:String(Math.floor(Math.random()*1e18)),yum:String(Date.now()*1000)};
      if (!yandexSession || yandexSession.expiresAt<=Date.now()) {
        const response = await request(origin+'/props/api/v1.0/sessions?'+new URLSearchParams(common),{method:'POST',headers,signal});
        if (!response.ok) throw new Error('Yandex 翻译会话无法建立');
        const result = await response.json(), session = result?.session;
        if (typeof session?.id!=='string' || !session.id || !Number.isFinite(session.creationTimestamp) || session.creationTimestamp<=0 || !Number.isFinite(session.maxAge) || session.maxAge<=0) throw new Error('Yandex 翻译会话无效');
        yandexSession={id:session.id,expiresAt:(session.creationTimestamp+session.maxAge)*1000};
      }
      const translated = [];
      const params = new URLSearchParams({...common,sid:yandexSession.id+'-5-0',source_lang:'en',target_lang:'zh',reason:'paste',format:'text',strategy:'0',disable_cache:'false',ajax:'1'});
      for (const part of chunks(text,600)) {
        const response = await request('https://translate.yandex.net/api/v1/tr.json/translate?'+params,{method:'POST',headers,body:new URLSearchParams({options:'0',text:part}).toString(),signal});
        if (!response.ok) throw new Error('Yandex 翻译请求失败');
        const result = await response.json();
        if (result?.code!==200 || !Array.isArray(result.text) || !result.text.length || !result.text.every(value=>typeof value==='string') || !result.text.join('').trim()) { yandexSession=undefined; throw new Error('Yandex 翻译未返回有效译文'); }
        translated.push(result.text.join(''));
      }
      return translated.join('');
    }
  };
}
