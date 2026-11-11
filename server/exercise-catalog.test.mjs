import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleExerciseCatalog} from './exercise-catalog.mjs';

test('Tatoeba catalog checks provenance and imports only once',async()=>{
 const original=globalThis.fetch;
 const sentence={id:123,text:'A garden grows.',lang:'eng',license:'CC0 1.0',owner:'alice',is_unapproved:false,translations:[{id:456,text:'花园生长。',lang:'cmn',license:'CC BY 2.0 FR',owner:'bob',is_unapproved:false,is_direct:true}]};
 globalThis.fetch=async input=>{const url=new URL(input);if(url.pathname.endsWith('/123'))return Response.json({data:sentence});assert.equal(url.searchParams.get('sort'),'relevance');return Response.json({data:[sentence,{...sentence,id:124,is_unapproved:true},{...sentence,id:125,translations:[{...sentence.translations[0],is_direct:false}]}]});};
 let result;const db={exercises:[]};let saves=0;
 const context={db,save:async()=>saves++,send:(_res,status,data)=>result={status,data},readBody:async()=>({id:123})};
 try{
  await handleExerciseCatalog({method:'GET'},{},new URL('http://localhost/api/exercise-catalog?q=garden'),context);
  assert.equal(result.data.count,1);assert.equal(result.data.results[0].attribution.chinese.author,'bob');
  await handleExerciseCatalog({method:'POST'},{},new URL('http://localhost/api/exercise-catalog/import'),context);
  assert.equal(result.status,201);assert.deepEqual(result.data.keywords,[]);assert.equal(result.data.catalogId,'123');
  await handleExerciseCatalog({method:'POST'},{},new URL('http://localhost/api/exercise-catalog/import'),context);
  assert.equal(result.status,200);assert.equal(saves,1);
 }finally{globalThis.fetch=original;}
});
