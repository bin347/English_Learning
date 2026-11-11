import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './index.mjs';

const material=JSON.parse(await readFile(new URL('../data/real-listening.json',import.meta.url),'utf8'));

test('real listening exercises upgrade old data and backups without overwriting edits', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-real-listening-'));
  let server=await startServer({dataDir:dir});
  const call=async(path,method='GET',body)=>{const r=await fetch(server.url+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  try {
    assert.equal(material.length,6);
    const boot=(await call('/api/bootstrap')).data;
    for (const clip of material) {
      assert.equal(boot.exercises.filter(e=>e.id===clip.id).length,1);
      assert.equal(boot.exercises.find(e=>e.id===clip.id).audioUrl,clip.audioUrl);
      assert.equal(clip.license,'CC BY 4.0');
    }
    const originalBackup=(await call('/api/backup')).data;
    const old=structuredClone(originalBackup);
    old.exercises=old.exercises.filter(e=>!material.some(clip=>clip.id===e.id));
    await server.close();
    await writeFile(join(dir,'data.json'),JSON.stringify(old));
    server=await startServer({dataDir:dir});
    assert.equal((await call('/api/bootstrap')).data.exercises.filter(e=>material.some(clip=>clip.id===e.id)).length,6);
    const clip=material[0];
    assert.equal((await call('/api/exercises/'+clip.id,'PATCH',{keywords:[{english:'girl',translations:['姑娘']}]})).status,200);
    await server.close(); server=await startServer({dataDir:dir});
    assert.deepEqual((await call('/api/bootstrap')).data.exercises.find(e=>e.id===clip.id).keywords,[{english:'girl',translations:['姑娘']}]);
    assert.equal((await call('/api/restore','POST',old)).status,200);
    assert.equal((await call('/api/bootstrap')).data.exercises.filter(e=>material.some(c=>c.id===e.id)).length,6);
    const grade=await call('/api/grade','POST',{exerciseId:clip.id,answer:clip.reference,mode:'basic',practiceType:'listening',answerMode:'chinese'});
    assert.equal(grade.status,200);
    assert.ok(Number.isFinite(grade.data.result.score));
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});

test('only bundled listening audio is served with correct MIME type', async () => {
  const dir=await mkdtemp(join(tmpdir(),'shiju-audio-'));
  const server=await startServer({dataDir:dir});
  try {
    for (const clip of material) {
      const response=await fetch(server.url+clip.audioUrl);
      assert.equal(response.status,200);
      assert.equal(response.headers.get('content-type'),'audio/flac');
      const actual=Buffer.from(await response.arrayBuffer());
      const expected=await readFile(new URL('../data/listening-audio/'+clip.audioUrl.split('/').pop(),import.meta.url));
      assert.deepEqual(actual,expected);
      assert.equal(actual.subarray(0,4).toString(),'fLaC');
    }
    assert.equal((await fetch(server.url+'/audio/missing.flac')).status,404);
    assert.equal((await fetch(server.url+'/audio/real-listening.json')).status,404);
    assert.equal((await fetch(server.url+'/audio/%2e%2e%2freal-listening.json')).status,404);
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});
