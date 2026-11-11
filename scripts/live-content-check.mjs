import {startServer} from '../server/index.mjs';
import {mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const dir=await mkdtemp(join(resolve('test-results'),'live-'));
const service=await startServer({dataDir:dir});
try {
  const get=async path=>{const r=await fetch(service.url+path);const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
  const post=async(path,body)=>{const r=await fetch(service.url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
  const catalog=await get('/api/catalog?q='+encodeURIComponent('傲慢与偏见'));
  const book=await post('/api/catalog/import',{id:catalog.results[0].id});
  console.log(JSON.stringify({check:'book-import',title:book.title,characters:book.text.length}));
  const movies=await get('/api/media/search?source=cms&q='+encodeURIComponent('老友记'));
  const media=await post('/api/media/resolve',movies.results[0]);
  const response=await fetch(media.episodes[0].url,{signal:AbortSignal.timeout(20000)});
  console.log(JSON.stringify({check:'media',results:movies.results.length,episodes:media.episodes.length,manifestStatus:response.status,manifestHasSubtitles:(await response.text()).includes('TYPE=SUBTITLES')}));
}finally {await service.close();}
