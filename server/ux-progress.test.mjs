import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './index.mjs';

test('book progress counts practiced words once, excludes collection-only words, and survives restore', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-book-progress-'));
  let server=await startServer({dataDir:dir});
  const call=async(path,body,method=body?'POST':'GET')=>{
    const response=await fetch(server.url+'/api'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    assert.ok(response.ok); return response.json();
  };
  try {
    const initial=await call('/vocabulary?book=cet4&state=new&limit=2');
    assert.ok(initial.summary.total>100);
    assert.equal(initial.summary.studied,0);
    const word=initial.words[0].word;
    await call('/words',{word});
    assert.equal((await call('/vocabulary?book=saved&state=learning')).summary.studied,0);
    await call('/vocabulary/progress',{word,action:'again',book:'cet4'});
    await call('/vocabulary/progress',{word,action:'remembered',book:'cet4'});
    const summary=(await call('/vocabulary?book=cet4&state=learning')).summary;
    assert.deepEqual(summary,{total:initial.summary.total,studied:1,mastered:0,learning:1});
    assert.deepEqual((await call('/vocabulary?book=cet4&state=new')).summary,summary);
    await call('/vocabulary/progress',{word,action:'mastered',book:'cet4'});
    const expected={total:initial.summary.total,studied:1,mastered:1,learning:0};
    const backup=await call('/backup');
    await call('/restore',backup);
    await server.close(); server=await startServer({dataDir:dir});
    assert.deepEqual((await call('/vocabulary?book=cet4&state=mastered')).summary,expected);
    assert.deepEqual((await call('/vocabulary?book=saved&state=mastered')).summary,{total:1,studied:1,mastered:1,learning:0});
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});

test('connection test uses unsaved configuration and returns safe errors', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-api-test-'));
  let request,fail=false;
  const server=await startServer({dataDir:dir,aiFetch:async(url,options)=>{
    request={url,body:JSON.parse(options.body)};
    return fail ? {ok:false,status:401} : {ok:true,json:async()=>({choices:[{message:{content:'OK'}}]})};
  }});
  try {
    const config={apiBase:'https://example.test/v1',apiKey:'private-test-key',model:'test-model'};
    const post=body=>fetch(server.url+'/api/settings/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post(config)).status,200);
    assert.equal(request.url,'https://example.test/v1/chat/completions');
    assert.equal(request.body.max_tokens,8);
    assert.equal((await (await fetch(server.url+'/api/settings')).json()).apiBase,'');
    fail=true;
    const failed=await post(config), message=await failed.text();
    assert.equal(failed.status,400);
    assert.match(message,/密钥认证失败/);
    assert.doesNotMatch(message,/private-test-key/);
    assert.equal((await post({...config,apiBase:'file:///test'})).status,400);
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});
