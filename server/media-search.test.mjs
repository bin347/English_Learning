import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleContentApi} from './catalog-media.mjs';

test('media search filters real metadata and preserves unknown-language results when requested', async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=new URL(input);
    const data=url.searchParams.get('ac')==='list'?{class:[{type_pid:1,type_id:11,type_name:'剧情片'},{type_pid:2,type_id:16,type_name:'欧美剧'}]}:{list:[{vod_id:1,vod_name:'English movie',type_name:'剧情片',vod_area:'美国',vod_lang:'英语'},{vod_id:2,vod_name:'Other movie',type_name:'剧情片',vod_area:'日本',vod_lang:'日语'},{vod_id:3,vod_name:'Unknown',type_name:'欧美剧',vod_area:'',vod_lang:''}]};
    return new Response(JSON.stringify(data),{status:200});
  };
  try {
    let response;
    const context={db:{settings:{mediaApi:'https://example.test/api'}},send:(_res,status,data)=>{response={status,data}}};
    await handleContentApi({method:'GET'},{},new URL('http://localhost/api/media/search?q=test'),context);
    assert.deepEqual(response.data.results.map(x=>x.id),['1']);
    await handleContentApi({method:'GET'},{},new URL('http://localhost/api/media/search?q=test&type=tv&language=all'),context);
    assert.deepEqual(response.data.results.map(x=>x.id),['3']);
    await handleContentApi({method:'GET'},{},new URL('http://localhost/api/media/categories'),context);
    assert.ok(response.data.types.some(x=>x.value==='tv'));
  } finally {globalThis.fetch=original;}
});

test('network failures give an actionable message instead of fetch failed', async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{throw new TypeError('fetch failed');};
  try {
    const context={db:{settings:{mediaApi:'https://example.test/api'}},send:()=>{}};
    await assert.rejects(()=>handleContentApi({method:'GET'},{},new URL('http://localhost/api/media/search?q=test'),context),/无法连接影视数据源/);
  } finally {globalThis.fetch=original;}
});

test('search combines available sources and resolves an item against its own source', async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=new URL(input);
    if(url.hostname==='api.guangsuapi.com') throw new TypeError('offline');
    if(url.searchParams.has('ids')) return Response.json({list:[{vod_name:url.hostname,vod_play_url:'第一集$https://example.test/episode.m3u8'}]});
    if(url.searchParams.get('ac')==='list') return Response.json({class:[{type_id:30,type_pid:0,type_name:'连续剧'},{type_pid:30,type_name:'欧美剧'}]});
    return Response.json({list:[{vod_id:7,vod_name:'无耻之徒',type_name:'欧美剧',vod_area:'美国',vod_lang:'英语'}]});
  };
  try {
    let response;
    const context={db:{settings:{mediaApi:''}},send:(_res,status,data)=>response={status,data},readBody:async()=>({id:'7',sourceId:'baofeng'})};
    await handleContentApi({method:'GET'},{},new URL('http://localhost/api/media/search?type=tv&q=test'),context);
    assert.deepEqual(response.data.results.map(item=>item.sourceId),['360','baofeng','zuid']);
    assert.match(response.data.warning,/1 个/);
    await handleContentApi({method:'POST'},{},new URL('http://localhost/api/media/resolve'),context);
    assert.equal(response.data.title,'bfzyapi.com');
    assert.equal(response.data.episodes.length,1);
  } finally {globalThis.fetch=original;}
});
