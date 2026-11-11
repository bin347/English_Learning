import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './index.mjs';

test('book removal preserves related learning while removing its EPUB file', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-delete-book-'));
  let server=await startServer({dataDir:dir});
  const call=async(path,method='GET',body)=>{ const response=await fetch(server.url+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined}); return {status:response.status,data:await response.json()}; };
  try {
    const book=(await call('/api/books','POST',{title:'My EPUB',format:'epub',content:Buffer.from('test EPUB').toString('base64')})).data;
    const word=(await call('/api/words','POST',{word:'garden',meaning:'花园',context:'A garden.',bookId:book.id,location:'epubcfi(/6/2)',source:'My EPUB'})).data;
    const exercise=(await call('/api/exercises','POST',{text:'A garden.',reference:'一座花园。',bookId:book.id,location:'epubcfi(/6/2)'})).data;
    await call('/api/grade','POST',{exerciseId:exercise.id,answer:'一座花园',mode:'basic',practiceType:'sentence'});
    await access(join(dir,book.id+'.epub'));
    assert.equal((await call('/api/books/'+book.id,'DELETE')).status,200);
    await assert.rejects(access(join(dir,book.id+'.epub')),{code:'ENOENT'});
    assert.equal((await call('/api/books/'+book.id)).status,404);
    let db=(await call('/api/bootstrap')).data;
    assert.equal(db.words.find(w=>w.id===word.id).context,'A garden.');
    assert.equal(db.words.find(w=>w.id===word.id).source,'My EPUB');
    assert.ok(db.exercises.some(e=>e.id===exercise.id));
    assert.ok(db.attempts.some(a=>a.exerciseId===exercise.id));
    assert.equal((await call('/api/books/'+book.id,'DELETE')).status,404);
    await server.close(); server=await startServer({dataDir:dir});
    db=(await call('/api/bootstrap')).data;
    assert.ok(!db.books.some(b=>b.id===book.id));
    assert.ok(db.words.some(w=>w.id===word.id));
    assert.ok(db.exercises.some(e=>e.id===exercise.id));
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});

test('practice drafts persist by exercise and mode, and survive backup and restore', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-drafts-'));
  let server=await startServer({dataDir:dir});
  const call=async(path,method='GET',body)=>{ const response=await fetch(server.url+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined}); return {status:response.status,data:await response.json()}; };
  const saveDraft=(key,value)=>call('/api/practice-drafts','PUT',{key,value});
  try {
    const sentence='sentence:welcome-exercise:chinese', listenEnglish='listening:welcome-exercise:english', listenChinese='listening:welcome-exercise:chinese';
    assert.deepEqual((await call('/api/practice-drafts')).data.drafts,{});
    assert.equal((await saveDraft(sentence,'句子答案')).status,200);
    assert.equal((await saveDraft(listenEnglish,'listening answer')).status,200);
    assert.equal((await saveDraft(listenChinese,'听力中文')).status,200);
    assert.equal((await saveDraft('sentence:welcome-exercise:english','bad')).status,400);
    assert.equal((await saveDraft(sentence,'x'.repeat(10001))).status,400);
    await server.close(); server=await startServer({dataDir:dir});
    const drafts=(await call('/api/practice-drafts')).data.drafts;
    assert.deepEqual(drafts,{[sentence]:'句子答案',[listenEnglish]:'listening answer',[listenChinese]:'听力中文'});
    const backup=(await call('/api/backup')).data;
    assert.deepEqual(backup.practiceDrafts,drafts);
    assert.equal((await saveDraft(sentence,'')).status,200);
    assert.equal((await call('/api/practice-drafts')).data.drafts[sentence],undefined);
    assert.equal((await call('/api/restore','POST',backup)).status,200);
    assert.deepEqual((await call('/api/practice-drafts')).data.drafts,drafts);
    const invalid=structuredClone(backup); invalid.practiceDrafts[sentence]=42;
    assert.equal((await call('/api/restore','POST',invalid)).status,400);
    const old=structuredClone(backup); delete old.practiceDrafts;
    assert.equal((await call('/api/restore','POST',old)).status,200);
    assert.deepEqual((await call('/api/practice-drafts')).data.drafts,{});
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});

test('practice positions persist separately and restore with backups', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-position-'));
  let server=await startServer({dataDir:dir});
  const call=async(path,method='GET',body)=>{ const response=await fetch(server.url+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined}); return {status:response.status,data:await response.json()}; };
  const sentence={id:'station-exercise',level:'all',topic:'all',source:'all',mode:'english'};
  const listening={id:'library-exercise',level:'all',topic:'all',source:'all',mode:'chinese'};
  const vocabulary={book:'cet6',state:'new',mode:'fill',offset:0,handled:[],word:'study',answer:'学习',feedback:null,roundWords:['study']};
  try {
    for (const entry of [{sentence},{listening},{vocabulary}]) assert.equal((await call('/api/practice-progress','PUT',entry)).status,200);
    assert.equal((await call('/api/practice-progress','PUT',{vocabulary:{...vocabulary,handled:'bad'}})).status,400);
    assert.equal((await call('/api/practice-progress','PUT',{vocabulary:{...vocabulary,roundWords:'bad'}})).status,400);
    const longRound=Array.from({length:2500},(_,i)=>`word-${i}`);
    assert.equal((await call('/api/practice-progress','PUT',{vocabulary:{...vocabulary,roundWords:longRound}})).status,200);
    assert.equal((await call('/api/practice-progress','PUT',{vocabulary})).status,200);
    await server.close(); server=await startServer({dataDir:dir});
    assert.deepEqual((await call('/api/practice-progress')).data,{sentence,listening,vocabulary});
    const backup=(await call('/api/backup')).data;
    assert.deepEqual(backup.practiceProgress,{sentence,listening,vocabulary});
    assert.equal((await call('/api/restore','POST',{...backup,practiceProgress:{}})).status,200);
    assert.deepEqual((await call('/api/practice-progress')).data,{});
    assert.equal((await call('/api/restore','POST',backup)).status,200);
    assert.deepEqual((await call('/api/practice-progress')).data,{sentence,listening,vocabulary});
    delete backup.practiceProgress;
    assert.equal((await call('/api/restore','POST',backup)).status,200);
    assert.deepEqual((await call('/api/practice-progress')).data,{});
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});
