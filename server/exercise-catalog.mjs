import { randomUUID } from 'node:crypto';

const licenses = {
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY 2.0 FR': 'https://creativecommons.org/licenses/by/2.0/fr/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/'
};

function convert(sentence) {
  if (!sentence || sentence.lang !== 'eng' || sentence.is_unapproved !== false || !sentence.id || !sentence.text || !sentence.owner || !licenses[sentence.license]) return null;
  const translation = (sentence.translations || []).find(t => t.lang === 'cmn' && t.is_direct === true && t.is_unapproved === false && t.id && t.text && t.owner && licenses[t.license]);
  if (!translation) return null;
  const length = sentence.text.trim().split(/\s+/).length;
  return {
    id: String(sentence.id), text: sentence.text, reference: translation.text,
    level: length <= 8 ? 'beginner' : length <= 16 ? 'intermediate' : 'advanced', topic: '社区例句', source: 'Tatoeba',
    sourceUrl: `https://tatoeba.org/en/sentences/show/${sentence.id}`,
    license: sentence.license,
    attribution: {
      english: {id:sentence.id, author:sentence.owner, license:sentence.license, licenseUrl:licenses[sentence.license], url:`https://tatoeba.org/en/sentences/show/${sentence.id}`},
      chinese: {id:translation.id, author:translation.owner, license:translation.license, licenseUrl:licenses[translation.license], url:`https://tatoeba.org/en/sentences/show/${translation.id}`}
    }
  };
}

async function request(url) {
  const response = await fetch(url, {signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('在线例句服务暂不可用');
  return response.json();
}

export async function handleExerciseCatalog(req,res,url,{readBody,send,db,save}) {
  if (url.pathname === '/api/exercise-catalog' && req.method === 'GET') {
    const q=(url.searchParams.get('q')||'').trim();
    if (!q || q.length>200) { send(res,400,{error:'请输入搜索词'}); return true; }
    const endpoint=new URL('https://api.tatoeba.org/v1/sentences');
    for (const [key,value] of Object.entries({lang:'eng',q,'trans:lang':'cmn','showtrans:lang':'cmn',include:'audios',sort:'relevance',limit:'10'})) endpoint.searchParams.set(key,value);
    const data=await request(endpoint);
    const results=data.data.map(convert).filter(Boolean);
    send(res,200,{results,count:results.length}); return true;
  }
  if (url.pathname === '/api/exercise-catalog/import' && req.method === 'POST') {
    const body=await readBody(req), id=String(body.id||'');
    if (!/^\d+$/.test(id) || (body.keywords !== undefined && (!Array.isArray(body.keywords) || body.keywords.some(k=>!k || typeof k.english!=='string' || !k.english.trim() || !Array.isArray(k.translations) || !k.translations.length || k.translations.some(t=>typeof t!=='string' || !t.trim()))))) { send(res,400,{error:'例句编号或关键词无效'}); return true; }
    const existing=db.exercises.find(e=>e.catalogSource==='tatoeba' && e.catalogId===id);
    if (existing) { send(res,200,existing); return true; }
    const endpoint=new URL(`https://api.tatoeba.org/v1/sentences/${id}`);
    endpoint.searchParams.set('showtrans:lang','cmn'); endpoint.searchParams.set('include','audios');
    const data=await request(endpoint), item=convert(data.data);
    if (!item) { send(res,400,{error:'例句缺少已审核的直译或许可信息'}); return true; }
    const exercise={...item,id:randomUUID(),catalogSource:'tatoeba',catalogId:id,keywords:body.keywords||[],createdAt:new Date().toISOString()};
    db.exercises.push(exercise); await save(); send(res,201,exercise); return true;
  }
  return false;
}
