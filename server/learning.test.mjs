import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { startServer } from './index.mjs';
import { matchesMeaning } from '../frontend/src/vocabulary-answer.mjs';

test('exam word books keep learning progress separate from saved vocabulary and restore both', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-progress-'));
  let server=await startServer({dataDir:dir});
  const call=async(path,body,method)=>{
    const r=await fetch(server.url+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    return {status:r.status,data:await r.json()};
  };
  try {
    const books=(await call('/api/vocabulary/books')).data;
    assert.ok(books.find(book=>book.id==='cet4').count>3500);
    assert.ok(books.find(book=>book.id==='cet6').count>5000);
    const words=(await call('/api/vocabulary?book=cet4')).data;
    const word=words.words[0].word;
    const mastered=await call('/api/vocabulary/progress',{word,action:'mastered',book:'cet4'});
    assert.equal(mastered.data.status,'mastered');
    assert.equal(mastered.data.nextReview,null);
    let boot=(await call('/api/bootstrap')).data;
    assert.equal(boot.words.length,0);
    assert.equal(boot.stats.masteredWords,1);
    assert.equal((await call('/api/vocabulary?book=cet4&state=new')).data.words.some(row=>row.word===word),false);
    assert.equal((await call('/api/vocabulary?book=cet4&state=mastered')).data.words[0].word,word);
    assert.equal((await call('/api/vocabulary/progress',{word,action:'remembered'})).data.status,'mastered');
    const again=await call('/api/vocabulary/progress',{word,action:'again',book:'cet4'});
    assert.equal(again.data.status,'learning');
    assert.ok(Date.parse(again.data.nextReview)>Date.now());
    assert.equal((await call('/api/vocabulary?book=cet4&state=review')).data.total,0);
    for(let i=0;i<4;i++) await call('/api/vocabulary/progress',{word,action:'remembered',book:'cet4'});
    assert.equal((await call('/api/bootstrap')).data.wordProgress[word].status,'mastered');
    const saved=(await call('/api/words',{word,context:'My source sentence.'})).data;
    const duplicate=(await call('/api/words',{word:word.toUpperCase(),meaning:'补充释义'})).data;
    assert.equal(duplicate.id,saved.id);
    boot=(await call('/api/bootstrap')).data;
    assert.equal(boot.words.length,1);
    assert.equal(boot.words[0].context,'My source sentence.');
    const backup=(await call('/api/backup')).data;
    await server.close(); server=await startServer({dataDir:dir});
    assert.equal((await call('/api/bootstrap')).data.wordProgress[word].status,'mastered');
    assert.equal((await call('/api/restore',backup)).status,200);
    const bad=structuredClone(backup); bad.wordProgress[word].nextReview='not a date';
    assert.equal((await call('/api/restore',bad)).status,400);
    delete backup.wordProgress; delete backup.settings.apiUses;
    backup.settings.translationProvider='google'; // Old backup migrates without restoring a removed provider.
    assert.equal((await call('/api/restore',backup)).status,200);
    boot=(await call('/api/bootstrap')).data;
    assert.equal(boot.wordProgress[word].status,'mastered');
    assert.deepEqual(boot.settings.apiUses,[]);
    assert.equal(boot.settings.translationProvider,undefined);
    await call('/api/words',{word:'quiet library phrase',meaning:'安静的图书馆短语',context:'The library is quiet.'});
    const phrases=(await call('/api/vocabulary?book=saved&state=learning')).data.words;
    assert.equal(phrases.find(row=>row.word==='quiet library phrase').context,'The library is quiet.');
    assert.equal((await call('/api/vocabulary?book=learned&state=learning')).data.words.some(row=>row.word==='quiet library phrase'),true);
    assert.equal((await call('/api/vocabulary/progress',{word:'quiet library phrase',action:'remembered',book:'saved'})).data.status,'learning');
    const quiet=(await call('/api/dictionary?q=quiet')).data;
    const effect=(await call('/api/dictionary?q=effect')).data;
    for (const {word,meaning,similar} of [
      {word:'quiet',meaning:quiet.meanings.join('；'),similar:'quite'},
      {word:'effect',meaning:effect.meanings.join('；'),similar:'affect'},
      phrases.find(row=>row.word==='quiet library phrase')
    ]) {
      const {status,data}=await call('/api/vocabulary/choices',{word,meaning});
      assert.equal(status,200);
      assert.equal(data.choices.length,4);
      assert.equal(new Set(data.choices.map(choice=>choice.meaning)).size,4);
      assert.deepEqual(data.choices.filter(choice=>matchesMeaning(choice.meaning,meaning)).map(choice=>choice.word),[word]);
      if (similar) assert.ok(data.choices.some(choice=>choice.word===similar));
      assert.ok(!data.choices.some(choice=>choice.word==='quiets'));
    }
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});

test('API purposes control translation priority and grading; invalid API output falls back automatically', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-purposes-'));
  let content='自定义译文', apiCalls=0, webCalls=0, webFails=false;
  const mock=http.createServer((req,res)=>{apiCalls++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content}}]}));});
  await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  const translationFetch=async input=>{
    webCalls++;
    const url=new URL(input);
    assert.equal(url.hostname.includes('google'),false);
    if(webFails) throw new Error('Offline');
    if(url.pathname==='/translator') return {ok:true,url:'https://cn.bing.com/translator',text:async()=> 'IG:"123"; params_AbusePreventionHelper=[1,"token",3600000]; <i data-iid="translator.1">'};
    return Response.json([{translations:[{text:'内置译文'}]}]);
  };
  const server=await startServer({dataDir:dir,translationFetch});
  const call=async(path,body,method='POST')=>{
    const r=await fetch(server.url+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,data:await r.json()};
  };
  try {
    const settings={apiBase:`http://127.0.0.1:${mock.address().port}`,model:'local',apiUses:['grading']};
    await call('/api/settings',settings,'PUT');
    assert.equal((await call('/api/translate',{text:'A fresh sentence.'})).data.provider,'bing');
    assert.equal(apiCalls,0);
    await call('/api/settings',{apiUses:['translation']},'PUT');
    const before=webCalls;
    assert.equal((await call('/api/translate',{text:'A fresh sentence.'})).data.provider,'ai');
    assert.equal(webCalls,before);
    const grade={exerciseId:'welcome-exercise',answer:'米娅每天早上给花浇水',mode:'auto',practiceType:'sentence',answerMode:'chinese'};
    assert.equal((await call('/api/grade',grade)).data.mode,'basic');
    content=null;
    const fallback=await call('/api/translate',{text:'The garden is beautiful.'});
    assert.equal(fallback.data.provider,'bing');
    assert.match(fallback.data.notice,/API/);
    webFails=true;
    assert.equal((await call('/api/translate',{text:'The garden is beautiful.'})).data.provider,'dictionary');
    await call('/api/settings',{apiUses:['grading']},'PUT');
    content='not JSON';
    const basicFallback=await call('/api/grade',grade);
    assert.equal(basicFallback.data.result.score,100);
    assert.match(basicFallback.data.result.notice,/API 评分暂不可用/);
    content=JSON.stringify({score:85,reference:'米娅每天早晨给花浇水。',strengths:['主旨准确'],issues:['可更自然'],suggestedWords:[]});
    assert.equal((await call('/api/grade',grade)).data.mode,'ai');
    assert.equal((await call('/api/settings',{apiUses:['unknown']},'PUT')).status,400);
  } finally { await server.close(); await new Promise(resolve=>mock.close(resolve)); await rm(dir,{recursive:true,force:true}); }
});

test('graded materials and attempts preserve module identity and confirmed vocabulary flow', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-materials-'));
  const server=await startServer({dataDir:dir});
  const call=async(path,body)=>{
    const r=await fetch(server.url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    return r.json();
  };
  try {
    const boot=await call('/api/bootstrap');
    assert.ok(boot.exercises.length>=153);
    for(const level of ['beginner','intermediate','advanced']) assert.equal(boot.exercises.filter(exercise=>exercise.id.startsWith('original-practice-') && exercise.level===level).length,50);
    const selected=boot.exercises.find(exercise=>exercise.level==='advanced');
    const translation=await call('/api/grade',{exerciseId:selected.id,answer:selected.reference,mode:'basic',practiceType:'sentence',answerMode:'chinese'});
    assert.equal(translation.result.score,100);
    assert.equal(translation.practiceType,'sentence');
    const listening=await call('/api/grade',{exerciseId:selected.id,answer:'one wrong word',mode:'dictation',practiceType:'listening',answerMode:'english'});
    assert.equal(listening.practiceType,'listening');
    assert.ok(listening.result.suggestedWords.length>0);
    const after=await call('/api/bootstrap');
    assert.equal(after.words.length,0);
    assert.deepEqual(after.attempts.map(attempt=>attempt.practiceType),['sentence','listening']);
    const lookup=await call('/api/dictionary/batch',{text:'Flowers watered the garden.'});
    assert.ok(lookup.entries.find(word=>word.original==='watered').meanings.length);
    const preview=await call('/api/reading/preview',{text:'The garden is beautiful.'});
    assert.equal(preview.totalWords,4);
    assert.ok(preview.knownWords>0);
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});
