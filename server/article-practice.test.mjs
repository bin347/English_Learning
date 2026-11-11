import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './index.mjs';

test('whole text becomes ordered exercises and survives restart and backup', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-article-'));
  let server=await startServer({dataDir:dir});
  const call=async(path,method='GET',body)=>{const r=await fetch(server.url+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try {
    const book=(await call('/api/books','POST',{title:'A short article',text:'The rain stopped. We went outside! Then the sun came out.',format:'text'})).data;
    const result=await call('/api/article-practice','POST',{bookId:book.id});
    assert.equal(result.status,201); assert.equal(result.data.count,3);
    assert.equal((await call('/api/article-practice','POST',{bookId:book.id})).status,200);
    let exercises=(await call('/api/bootstrap')).data.exercises.filter(x=>x.articleId===result.data.articleId);
    assert.deepEqual(exercises.map(x=>x.text),['The rain stopped.','We went outside!','Then the sun came out.']);
    assert.deepEqual(exercises.map(x=>x.location),['t:0','t:18','t:35']);
    assert.equal((await call('/api/grade','POST',{exerciseId:exercises[1].id,answer:'We went outside',mode:'dictation',practiceType:'listening'})).data.result.score,100);
    const progress={id:exercises[1].id,level:'all',topic:'all',source:'all',mode:'english',practiceStyle:'article',articleId:result.data.articleId,positions:{[result.data.articleId]:exercises[1].id},singleId:'welcome-exercise'};
    assert.equal((await call('/api/practice-progress','PUT',{listening:progress})).status,200);
    const backup=(await call('/api/backup')).data;
    await server.close(); server=await startServer({dataDir:dir});
    assert.deepEqual((await call('/api/practice-progress')).data.listening,progress);
    exercises=(await call('/api/bootstrap')).data.exercises.filter(x=>x.articleId===result.data.articleId);
    assert.equal(exercises.length,3);
    backup.exercises.find(x=>x.id===exercises[1].id).location=18;
    backup.exercises.find(x=>x.id==='article-library-4').reference='莉娜开始每天课后在图书馆学习一小时。';
    assert.equal((await call('/api/restore','POST',backup)).status,200);
    assert.equal((await call('/api/bootstrap')).data.exercises.find(x=>x.id===exercises[1].id).location,'t:18');
    assert.equal((await call('/api/bootstrap')).data.exercises.find(x=>x.id==='article-library-4').reference,'莉娜开始课后在图书馆学习一小时。');
    assert.equal((await call('/api/practice-progress')).data.listening.id,progress.id);
    const abbreviations=(await call('/api/books','POST',{title:'Abbreviations',text:'Dr. Smith met Mrs. Brown. They spoke.',format:'text'})).data;
    const imported=await call('/api/article-practice','POST',{bookId:abbreviations.id});
    const split=(await call('/api/bootstrap')).data.exercises.filter(x=>x.articleId===imported.data.articleId);
    assert.deepEqual(split.map(x=>x.text),['Dr. Smith met Mrs. Brown.','They spoke.']);
    const chapter=(await call('/api/books','POST',{title:'Chapter',text:'Chapter 1\n\nThe sun rose. Birds sang.',format:'text'})).data;
    const chapterImport=await call('/api/article-practice','POST',{bookId:chapter.id});
    const chapterSentences=(await call('/api/bootstrap')).data.exercises.filter(x=>x.articleId===chapterImport.data.articleId);
    assert.deepEqual(chapterSentences.map(x=>x.text),['The sun rose.','Birds sang.']);
    assert.equal((await call('/api/article-practice','POST',{bookId:'missing'})).status,400);
  } finally {await server.close();await rm(dir,{recursive:true,force:true});}
});
