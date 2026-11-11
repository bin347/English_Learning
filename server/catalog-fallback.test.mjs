import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleContentApi} from './catalog-media.mjs';

test('local Gutenberg snapshot can be searched when Gutendex is unavailable',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error('offline');};
 try {let response;await handleContentApi({method:'GET'},{},new URL('http://localhost/api/catalog?q=The%20Great%20Gatsby'),{db:{books:[]},send:(_r,status,data)=>response={status,data}});assert.ok(response.data.results.some(book=>book.id===64317));assert.match(response.data.warning,/本地书目/);} finally {globalThis.fetch=original;}
});

test('catalog import falls back to a second text endpoint using local metadata',async()=>{
 const original=globalThis.fetch,visited=[];
 globalThis.fetch=async input=>{const url=String(input);visited.push(url);if(url.includes('/cache/'))return new Response('offline',{status:503});if(url.includes('/files/64317/64317-0.txt'))return new Response('Public domain English text.');throw new Error('unexpected '+url);};
 try {let response,saved=0;const db={books:[]};await handleContentApi({method:'POST'},{},new URL('http://localhost/api/catalog/import'),{db,readBody:async()=>({id:64317}),send:(_r,status,data)=>response={status,data},save:async()=>{saved++}});assert.equal(response.status,201);assert.equal(response.data.title,'The Great Gatsby');assert.equal(response.data.text,'Public domain English text.');assert.equal(saved,1);assert.ok(!visited.some(url=>url.includes('pglaf.org')));}finally{globalThis.fetch=original;}
});

test('an online search result can supply metadata if its catalog is unavailable during import',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response('Readable text.');
 try {let response;await handleContentApi({method:'POST'},{},new URL('http://localhost/api/catalog/import'),{db:{books:[]},readBody:async()=>({id:999999,title:'An online title',author:'An author'}),send:(_r,status,data)=>response={status,data},save:async()=>{}});assert.equal(response.data.title,'An online title');}finally{globalThis.fetch=original;}
});

test('media resolve puts direct HLS before webpage entries',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({list:[{vod_name:'Example',vod_play_from:'web$$$m3u8',vod_play_url:'第1集$https://example.test/play/1$$$第1集$https://example.test/play/1/index.m3u8?token=ok'}]});
 try {let response;await handleContentApi({method:'POST'},{},new URL('http://localhost/api/media/resolve'),{db:{settings:{mediaApi:''}},readBody:async()=>({id:'5',sourceId:'360'}),send:(_r,status,data)=>response={status,data}});assert.equal(response.data.episodes.length,2);assert.equal(response.data.episodes[0].direct,true);assert.match(response.data.episodes[0].url,/m3u8/);assert.equal(response.data.episodes[1].direct,false);}finally{globalThis.fetch=original;}
});
