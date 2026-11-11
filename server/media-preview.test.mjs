import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from './index.mjs';

test('AI preview can select outside the local shortlist, checks dialogue and supports topic fallback', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shiju-media-preview-'));
  let content='';
  const mock=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content}}]}));});
  await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const server=await startServer({dataDir:dir});
  const call=async(path,body,method='POST')=>{const response=await fetch(server.url+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
  try {
    const settings={apiBase:`http://127.0.0.1:${mock.address().port}`,model:'local',apiUses:['media']};
    assert.equal((await call('/api/settings',settings,'PUT')).status,200);
    content=JSON.stringify({words:[{word:'figure out',meaning:'弄明白',lineId:2,targets:['figured','out'],reason:'常用表达'}]});
    let result=await call('/api/media/ai-preview',{title:'Example',episode:'S01E01',dialogue:[{id:2,text:'We figured it out.'}]});
    assert.equal(result.data.grounded,true);
    assert.equal(result.data.words.length,1);
    assert.equal(result.data.words[0].context,'We figured it out.');
    result=await call('/api/media/ai-preview',{title:'Example',episode:'S01E01',dialogue:[{id:2,text:'Different line.'}]});
    assert.equal(result.status,400);
    content=JSON.stringify({words:[{word:'family',meaning:'家庭',lineId:null,targets:[],reason:'题材词'}]});
    result=await call('/api/media/ai-preview',{title:'Example',episode:'S01E01',dialogue:[]});
    assert.equal(result.data.grounded,false);
    content=JSON.stringify({words:Array.from({length:35},(_,i)=>({word:'word'+String.fromCharCode(97+Math.floor(i/26))+String.fromCharCode(97+i%26),meaning:'示例',lineId:null,targets:[],reason:'题材词'}))});
    result=await call('/api/media/ai-preview',{title:'Example',episode:'S01E01',dialogue:[],limit:30});
    assert.equal(result.data.words.length,30);
    result=await call('/api/media/ai-preview',{title:'Example',episode:'S01E01',dialogue:[],limit:15});
    assert.equal(result.data.words.length,15);
    assert.equal((await call('/api/media/ai-preview',{title:'Example',episode:'S01E01',dialogue:[],limit:50})).status,400);
    const backup=(await call('/api/backup',null,'GET')).data;
    assert.equal(backup.settings.openSubtitlesKey,undefined);
    assert.equal(backup.settings.subdlKey,undefined);
    assert.equal((await call('/api/restore',{...backup,settings:{...backup.settings,openSubtitlesKey:'legacy1',subdlKey:'legacy2'}})).status,200);
    assert.equal((await call('/api/settings',null,'GET')).data.subdlKey,undefined);
  } finally {await server.close();await new Promise(resolve=>mock.close(resolve));await rm(dir,{recursive:true,force:true});}
});
