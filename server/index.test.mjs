import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './index.mjs';
import http from 'node:http';

test('HTTP persistence, scoring, backup and security', async () => {
  const dir=await mkdtemp(join(tmpdir(),'english-test-'));
  let server=await startServer({dataDir:dir});
  const call=async (path,method='GET',body) => {
    const response=await fetch(server.url+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  };
  try {
    const boot=(await call('/api/bootstrap')).data;
    assert.ok(boot.books.length>=3);
    const word=(await call('/api/words','POST',{word:'garden',meaning:'花园'})).data;
    const reviewed=(await call('/api/words/'+word.id,'PATCH',{known:true})).data;
    assert.equal(reviewed.status,'mastered');
    assert.equal(reviewed.nextReview,null);
    assert.equal((await call('/api/words/'+word.id,'PATCH',{known:false})).data.status,'learning');
    const grade=await call('/api/grade','POST',{exerciseId:'welcome-exercise',answer:'米娅每天早上给花浇水',mode:'basic'});
    assert.equal(grade.data.result.score,100);
    assert.equal((await call('/api/grade','POST',{text:'hello',answer:'你好',mode:'basic'})).data.result.score,undefined);
    const dictation=await call('/api/grade','POST',{text:'one two',answer:'one two three',mode:'dictation'});
    assert.equal(dictation.data.result.score,67);
    assert.equal(dictation.data.result.diff.at(-1).status,'extra');
    const book=(await call('/api/books','POST',{title:'EPUB',format:'epub',content:Buffer.from('epub bytes').toString('base64')})).data;
    const bookmarks=[{id:'mark-1',location:'epubcfi(/6/2)',label:'第一页',progress:0,createdAt:new Date().toISOString()}];
    assert.equal((await call('/api/books/'+book.id,'PATCH',{bookmarks})).data.bookmarks[0].label,'第一页');
    assert.equal((await call('/api/books/'+book.id,'PATCH',{bookmarks:[{id:1}]})).status,400);
    await call('/api/settings','PUT',{apiKey:'secret'});
    const backup=(await call('/api/backup')).data;
    assert.equal(backup.settings.apiKey,undefined);
    assert.equal(Buffer.from(backup.files[book.id],'base64').toString(),'epub bytes');
    const bad=structuredClone(backup); bad.books[0].id='../escape';
    assert.equal((await call('/api/restore','POST',bad)).status,400);
    const badWord=structuredClone(backup); badWord.words[0].word=42;
    assert.equal((await call('/api/restore','POST',badWord)).status,400);
    assert.equal((await fetch(server.url+'/api/settings',{headers:{Origin:'https://evil.example'}})).status,403);
    await server.close(); server=await startServer({dataDir:dir});
    assert.equal((await call('/api/bootstrap')).data.words[0].word,'garden');
    assert.equal((await call('/api/restore','POST',backup)).status,200);
    assert.equal(await (await fetch(server.url+'/api/books/'+book.id+'/file')).text(),'epub bytes');
    assert.deepEqual((await call('/api/books/'+book.id)).data.bookmarks,bookmarks);
    assert.equal((await call('/api/settings')).data.apiKey,'secret');
    assert.ok(Array.isArray((await call('/api/vocabulary?limit=2')).data.words));
    assert.equal((await call('/api/dictionary?q=aaahed')).data.word,'aaah');
    assert.equal((await call('/api/books','POST',{title:'bad',content:'%%%'})).status,400);
    assert.equal((await call('/api/exercises','POST',{text:'hello',keywords:[{english:'hello',translations:['']}]})).status,400);
    assert.equal((await call('/api/settings','PUT',{unexpected:'x'})).status,400);
    const settings=await call('/api/settings','PUT',{fontSize:'20',lineHeight:'1.6',mediaApi:'https://example.com'});
    assert.equal(settings.data.fontSize,20);
    assert.equal(settings.data.lineHeight,1.6);
    assert.equal((await call('/api/settings','PUT',{fontSize:'abc'})).status,400);
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});

test('AI accepts local API without a key and rejects malformed responses', async () => {
  let message = JSON.stringify({score:80,strengths:['准确'],issues:['漏译'],suggestedWords:[]});
  const mock = http.createServer((req,res)=>{
    assert.equal(req.headers.authorization,undefined);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({choices:[{message:{content:message}}]}));
  });
  await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const dir=await mkdtemp(join(tmpdir(),'english-ai-'));
  const server=await startServer({dataDir:dir});
  const post=async (path,body)=>fetch(server.url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try {
    await fetch(server.url+'/api/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({apiBase:`http://127.0.0.1:${mock.address().port}`,model:'local',apiUses:['translation','grading']})});
    const good=await post('/api/grade',{exerciseId:'welcome-exercise',answer:'译文',mode:'ai'});
    assert.equal((await good.json()).result.score,80);
    message='花园很美。';
    const translation=await post('/api/translate',{text:'The garden is beautiful.',provider:'ai'});
    assert.equal((await translation.json()).translation,'花园很美。');
    message='not json';
    const bad=await post('/api/grade',{exerciseId:'welcome-exercise',answer:'译文',mode:'ai'});
    assert.equal(bad.status,400);
    assert.match((await bad.json()).error,/AI 评分暂不可用/);
    message=JSON.stringify({score:101,strengths:[],issues:[],suggestedWords:[]});
    assert.equal((await post('/api/grade',{exerciseId:'welcome-exercise',answer:'译文',mode:'ai'})).status,400);
  } finally {
    await server.close(); await new Promise(resolve=>mock.close(resolve)); await rm(dir,{recursive:true,force:true});
  }
});

test('AI grading uses the configured network client and reports safe failure reasons', async () => {
  const dir=await mkdtemp(join(tmpdir(),'english-ai-network-'));
  let status=200, requests=0, lastBody;
  const aiFetch=async (_url,options)=>{
    requests++;
    lastBody=JSON.parse(options.body);
    assert.equal(options.headers.Authorization,'Bearer test-secret');
    if (status==='offline') throw new Error('private network details');
    if (status!==200) return new Response('',{status});
    return Response.json({choices:[{message:{content:JSON.stringify({score:90,reference:'天空是蓝色的',strengths:['准确'],issues:[],suggestedWords:[]})}}]});
  };
  const server=await startServer({dataDir:dir,aiFetch});
  const call=async(path,body,method='POST')=> {
    const response=await fetch(server.url+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return response.json();
  };
  try {
    await call('/api/settings',{apiBase:'https://example.com/v1',apiKey:'test-secret',model:'test',apiUses:['grading']},'PUT');
    const grade={exerciseId:'welcome-exercise',answer:'天空是蓝色的',mode:'auto'};
    assert.equal((await call('/api/grade',grade)).mode,'ai');
    assert.equal(lastBody.thinking,undefined);
    await call('/api/settings',{apiBase:'https://api.deepseek.com/v1'},'PUT');
    assert.equal((await call('/api/grade',grade)).mode,'ai');
    assert.deepEqual(lastBody.thinking,{type:'disabled'});
    status=401;
    const auth=await call('/api/grade',grade);
    assert.equal(auth.mode,'basic');
    assert.match(auth.result.notice,/密钥认证失败/);
    assert.doesNotMatch(JSON.stringify(auth),/test-secret/);
    status='offline';
    const offline=await call('/api/grade',grade);
    assert.match(offline.result.notice,/无法连接 AI 服务/);
    assert.doesNotMatch(JSON.stringify(offline),/private network details/);
    assert.equal(requests,4);
  } finally {
    await server.close();
    await rm(dir,{recursive:true,force:true});
  }
});

