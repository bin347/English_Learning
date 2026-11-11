import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWebTranslators } from './web-translators.mjs';
import { startServer } from './index.mjs';

const bingPage = 'IG:"ABC123"; params_AbusePreventionHelper = [12345,"test-token",3600000]; <div data-iid="translator.1">';

for (const provider of ['bing','yandex']) {
  test(`${provider} translates paragraphs within upstream limits and reuses its session`, async () => {
    const parts=[], limit=provider==='bing'?1000:600;
    let sessions=0;
    const request=async (input,options)=>{
      const url=new URL(input);
      assert.ok(options.signal instanceof AbortSignal);
      if (url.pathname==='/translator') {
        sessions++;
        return {ok:true,url:'https://cn.bing.com/translator',text:async()=>bingPage};
      }
      if (url.pathname.endsWith('/sessions')) {
        sessions++;
        return Response.json({session:{id:'test-session',creationTimestamp:Date.now()/1000,maxAge:3600}});
      }
      const body=new URLSearchParams(options.body), part=body.get('text');
      assert.equal(options.method,'POST');
      assert.ok(part.length<=limit);
      if (provider==='bing') {
        assert.equal(url.hostname,'cn.bing.com');
        assert.equal(url.pathname,'/ttranslatev3');
        assert.equal(body.get('to'),'zh-Hans');
        assert.equal(body.get('token'),'test-token');
      } else {
        assert.equal(url.hostname,'translate.yandex.net');
        assert.equal(url.searchParams.get('sid'),'test-session-5-0');
        assert.equal(url.searchParams.get('target_lang'),'zh');
        assert.equal(options.headers.Referer,'https://translate.yandex.ru/');
      }
      parts.push(part);
      return Response.json(provider==='bing'?[{translations:[{text:'译文'}]}]:{code:200,text:['译文']});
    };
    const translator=createWebTranslators(request)[provider], original='word '.repeat(230);
    assert.equal(await translator(original),'译文译文');
    assert.equal(parts.join(''),original);
    assert.equal(await translator('A short sentence.'),'译文');
    assert.equal(sessions,1);
  });
}

test('Bing is preferred without API setup; failures fall back to Yandex then dictionary', async () => {
  const dir=await mkdtemp(join(tmpdir(),'english-bing-'));
  let failing=false, bingFailing=false;
  const request=async input=>{
    const url=new URL(input);
    if (failing || (bingFailing && url.hostname.endsWith('bing.com'))) throw new Error('Network unavailable');
    if (url.pathname==='/translator') return {ok:true,url:'https://cn.bing.com/translator',text:async()=>bingPage};
    if (url.pathname.endsWith('/sessions')) return Response.json({session:{id:'session',creationTimestamp:Date.now()/1000,maxAge:3600}});
    return Response.json(url.hostname.endsWith('bing.com')?[{translations:[{text:'花园很美。'}]}]:{code:200,text:['花园很美。']});
  };
  const server=await startServer({dataDir:dir,translationFetch:request});
  const post=async body=>(await fetch(server.url+'/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  try {
    assert.deepEqual(await post({text:'The garden is beautiful.'}),{provider:'bing',translation:'花园很美。'});
    bingFailing=true;
    const secondary=await post({text:'The garden is beautiful.'});
    assert.equal(secondary.provider,'yandex');
    assert.equal(secondary.translation,'花园很美。');
    failing=true;
    const result=await post({text:'The garden is beautiful.'});
    assert.equal(result.provider,'dictionary');
    assert.match(result.notice,/暂不可用/);
    assert.match(result.translation,/garden：.*花园/);
  } finally { await server.close(); await rm(dir,{recursive:true,force:true}); }
});

test('invalid responses never masquerade as a translation', async () => {
  const request=async input=>{
    const url=new URL(input);
    if (url.pathname==='/translator') return {ok:true,url:'https://cn.bing.com/translator',text:async()=>bingPage};
    if (url.pathname.endsWith('/sessions')) return Response.json({session:{id:'session',creationTimestamp:Date.now()/1000,maxAge:3600}});
    return Response.json({statusCode:205,code:200,text:[]});
  };
  const translators=createWebTranslators(request);
  await assert.rejects(()=>translators.bing('The garden is beautiful.'),/有效译文/);
  await assert.rejects(()=>translators.yandex('The garden is beautiful.'),/有效译文/);
});

test('Bing supports Electron responses without a response URL', async () => {
  const translator=createWebTranslators(async input=>{
    const url=new URL(input);
    assert.equal(url.hostname,'cn.bing.com');
    if (url.pathname==='/translator') return {ok:true,url:'',text:async()=>bingPage};
    return Response.json([{translations:[{text:'花园很美。'}]}]);
  });
  assert.equal(await translator.bing('The garden is beautiful.'),'花园很美。');
});
