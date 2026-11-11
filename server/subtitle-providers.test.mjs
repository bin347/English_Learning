import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync, strToU8} from 'fflate';
import {searchSubtitles, downloadSubtitle} from './subtitle-providers.mjs';

test('Chinese title resolves the matching year and falls back to the correct series', async ()=>{
  const requested=[];
  const request=async address=>{
    const url=new URL(address);
    requested.push(url.hostname+url.pathname);
    if (url.hostname==='www.wikidata.org') return Response.json({search:[
      {match:{text:'无耻之徒'},display:{label:{language:'en',value:'Shameless'}},description:'American television comedy-drama series'},
      {match:{text:'无耻之徒'},display:{label:{language:'en',value:'A Man Without Honor'}},description:'episode of Game of Thrones'}
    ]});
    if (url.hostname==='api.tvmaze.com') return Response.json([
      {show:{name:'Shameless',premiered:'2011-01-09',externals:{imdb:'tt1586680',thetvdb:161511},network:{country:{code:'US'}}}},
      {show:{name:'Shameless',premiered:'2004-01-13',externals:{imdb:'tt0377260',thetvdb:78846},network:{country:{code:'GB'}}}}
    ]);
    if (url.hostname==='api.thesubtitledb.org') {
      assert.equal(url.pathname,'/v1/by-imdb/tt0377260/season/1/episode/1');
      return new Response(null,{status:503});
    }
    if (url.pathname==='/shows/search/Shameless') return Response.json({shows:[
      {id:'uk',name:'Shameless',tvDbId:78846},
      {id:'us',name:'Shameless (US)',tvDbId:161511}
    ]});
    assert.equal(url.pathname,'/subtitles/get/uk/1/1/en');
    return Response.json({episode:{season:1,number:1},matchingSubtitles:[
      {completed:true,language:'English',subtitleId:'uk-sub',downloadUri:'/subtitles/download/uk-sub'}
    ]});
  };
  const result=await searchSubtitles({title:'无耻之徒(英版)',year:2004,type:'tv',season:1,episode:1},request);
  assert.equal(result.resolvedTitle,'Shameless');
  assert.equal(result.resolvedYear,2004);
  assert.deepEqual(result.sources.map(item=>[item.provider,item.id,item.exact]),[['gestdown','uk-sub',true]]);
  assert.deepEqual(result.warnings,['SubtitleDB 暂不可用']);
  assert.ok(!requested.includes('api.gestdown.info/subtitles/get/us/1/1/en'));
  assert.equal((await searchSubtitles({title:'无耻之徒(英版)',year:2011,type:'tv',season:1,episode:1},
    async address=>{
      const url=new URL(address);
      if (url.hostname==='www.wikidata.org' || url.hostname==='api.tvmaze.com') return request(address);
      return new Response(null,{status:404});
    })).resolvedTitle,undefined);
});

test('keyless subtitle lookup falls back from SubtitleDB to the exact Gestdown episode', async t=>{
  t.mock.method(globalThis,'fetch',async address=>{
    const url=new URL(address);
    assert.equal(url.searchParams.has('api_key'),false);
    if (url.hostname==='api.thesubtitledb.org') {
      assert.equal(url.pathname,'/v1/by-title/season/1/episode/2');
      return new Response(null,{status:503});
    }
    if (url.pathname==='/shows/search/Example%20(US)') return Response.json({shows:[{id:'us',name:'Example (US)'}]});
    assert.equal(url.pathname,'/subtitles/get/us/1/2/en');
    return Response.json({episode:{season:1,number:2},matchingSubtitles:[
      {completed:true,language:'English',subtitleId:'right',downloadUri:'/subtitles/download/right'},
      {completed:true,language:'Spanish',subtitleId:'wrong',downloadUri:'/subtitles/download/wrong'}
    ]});
  });
  const result=await searchSubtitles({title:'Example (US)',type:'tv',season:1,episode:2});
  assert.deepEqual(result.warnings,['SubtitleDB 暂不可用']);
  assert.deepEqual(result.sources.map(item=>[item.provider,item.id,item.exact]),[['gestdown','right',true]]);
});

test('movie lookup keeps a separate film fallback and does not promote an unverified remake',async t=>{
  t.mock.method(globalThis,'fetch',async address=>{
    const url=new URL(address);
    if (url.hostname==='api.thesubtitledb.org') return Response.json({
      title:{name:'Example',year:2000,media_type:'movie'},
      subtitles:{items:[{language:'en',format:'srt',download_url:'https://api.thesubtitledb.org/get/10'}]}
    });
    if (url.hostname==='v3-cinemeta.strem.io') return Response.json({metas:[{id:'tt1000002',name:'Example',releaseInfo:'2020'}]});
    assert.equal(url.hostname,'yifysubtitles.ch');
    assert.equal(url.pathname,'/movie-imdb/tt1000002');
    return new Response('<tr><td><span class="sub-lang">English</span></td><td><a href="/subtitles/example-2020">Example</a></td></tr>');
  });
  const result=await searchSubtitles({title:'Example',year:2020,type:'movie'});
  assert.deepEqual(result.sources.map(item=>[item.provider,item.year,item.exact]),[['subtitledb',2000,false],['yify',2020,true]]);
});

test('subtitle downloads follow the provider redirect, accept single-file ZIPs and refuse other hosts',async t=>{
  let destination='https://files.thesubtitledb.org/a.srt';
  let zip=zipSync({'one.srt':strToU8('Hello.')});
  t.mock.method(globalThis,'fetch',async address=>{
    const url=new URL(address);
    if (url.hostname==='api.thesubtitledb.org') return Response.redirect(destination);
    if (url.hostname==='files.thesubtitledb.org') return new Response('Hello.');
    assert.equal(url.hostname,'yifysubtitles.ch');
    return new Response(zip);
  });
  assert.equal(await downloadSubtitle('subtitledb','10'),'Hello.');
  assert.equal(await downloadSubtitle('yify','movie2'),'Hello.');
  destination='https://example.com/subtitle.srt';
  await assert.rejects(downloadSubtitle('subtitledb','10'),/下载地址无效/);
  zip=zipSync({'one.srt':strToU8('one'),'two.srt':strToU8('two')});
  await assert.rejects(downloadSubtitle('yify','movie2'),/唯一可用/);
});
