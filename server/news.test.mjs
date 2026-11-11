import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './index.mjs';
import { parseGlobalVoicesArticle } from './news.mjs';

test('news headlines keep source links and survive a failed source',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'study-news-'));
  const newsFetch=async url=>{
    if (url.includes('news.cn')) throw Error('offline');
    const html=url.includes('chinadaily')
      ? '<a href="//www.chinadaily.com.cn/a/202611/10/WS6af26bfde4b03ebf8519b6b4.html">China&#39;s ocean governance draws praise</a>'
      : '<item><title>A new story about China and its neighbours</title><link>https://globalvoices.org/2026/11/05/a-new-story-about-china/</link><pubDate>Thu, 05 Nov 2026 10:00:00 GMT</pubDate><dc:creator><![CDATA[Sample Author]]></dc:creator><content:encoded><![CDATA[<p>Article text</p>]]></content:encoded></item>';
    return {ok:true,text:async()=>html};
  };
  const server=await startServer({dataDir,newsFetch});
  try {
    const response=await fetch(server.url+'/api/news');
    const news=await response.json();
    assert.equal(response.status,200);
    assert.equal(news.results.length,2);
    assert.equal(news.results[0].publishedAt,'2026-11-10');
    assert.equal(news.results[1].sourceId,'global-voices');
    assert.equal(news.results[1].readable,true);
    assert.match(news.warning,/1 个新闻来源/);
    assert.equal(news.sources.length,3);
    assert.ok(news.sources.every(source=>source.url.startsWith('https://')));
  } finally { await server.close(); await rm(dataDir,{recursive:true,force:true}); }
});

test('news still offers official homepages when every source is offline',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'study-news-'));
  const server=await startServer({dataDir,newsFetch:async()=>{throw Error('offline');}});
  try {
    const response=await fetch(server.url+'/api/news');
    const news=await response.json();
    assert.equal(response.status,200);
    assert.deepEqual(news.results,[]);
    assert.equal(news.sources.length,3);
    assert.match(news.warning,/无法连接/);
  } finally { await server.close(); await rm(dataDir,{recursive:true,force:true}); }
});

test('a busy official source cannot hide the licensed reading source',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'study-news-'));
  const newsFetch=async url=>{
    const html=url.includes('chinadaily') ? Array.from({length:40},(_,i)=>`<a href="https://www.chinadaily.com.cn/a/202611/10/WS${String(i).padStart(24,'0')}.html">China news headline number ${i}</a>`).join('')
      : url.includes('news.cn') ? Array.from({length:40},(_,i)=>`<a href="https://english.news.cn/20261110/${String(i).padStart(32,'0')}/c.html">Xinhua news headline number ${i}</a>`).join('')
      : '<item><title>A new story about China and its neighbours</title><link>https://globalvoices.org/2026/11/05/a-new-story-about-china/</link><pubDate>Thu, 05 Nov 2026 10:00:00 GMT</pubDate><dc:creator>Sample Author</dc:creator><content:encoded><![CDATA[<p>Article text</p>]]></content:encoded></item>';
    return {ok:true,text:async()=>html};
  };
  const server=await startServer({dataDir,newsFetch});
  try {
    const news=await(await fetch(server.url+'/api/news')).json();
    assert.equal(news.results.filter(item=>item.sourceId==='china-daily').length,20);
    assert.equal(news.results.filter(item=>item.sourceId==='xinhua').length,20);
    assert.equal(news.results.filter(item=>item.sourceId==='global-voices').length,1);
  } finally { await server.close(); await rm(dataDir,{recursive:true,force:true}); }
});

test('licensed article extraction omits embedded and quoted material',()=>{
  const body='This original paragraph explains the background and the latest development in detail. '.repeat(5);
  const html=`<meta name="author" content="Sample Author"><article><h1>Current developments in China</h1><p>${body}</p><blockquote><p>Quoted third-party words should stay out of the copied article.</p></blockquote><figure><p>Image caption by another creator</p></figure><p>${body}</p></article>`;
  const article=parseGlobalVoicesArticle(html,'https://globalvoices.org/2026/11/05/current-developments-in-china/');
  assert.equal(article.author,'Sample Author');
  assert.equal(article.publishedAt,'2026-11-05');
  assert.equal(article.licenseUrl,'https://creativecommons.org/licenses/by/3.0/');
  assert.ok(article.text.length>300);
  assert.doesNotMatch(article.text,/third-party|Image caption/);
});

test('Global Voices RSS body can be read without fetching the article page',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'study-news-'));
  const url='https://globalvoices.org/2026/11/05/current-developments-in-china/';
  const body='<p>This original paragraph explains the background and the latest development in detail. </p>'.repeat(6);
  const feed=`<item><title>Current developments in China</title><link>${url}</link><pubDate>Thu, 05 Nov 2026 10:00:00 GMT</pubDate><dc:creator>Sample Author</dc:creator><content:encoded><![CDATA[${body}<blockquote><p>Quoted third-party words</p></blockquote>]]></content:encoded></item>`;
  const requests=[];
  const server=await startServer({dataDir,newsFetch:async request=>{requests.push(request);return {ok:true,text:async()=>feed};}});
  try {
    const response=await fetch(server.url+'/api/news/article?url='+encodeURIComponent(url));
    const article=await response.json();
    assert.equal(response.status,200);
    assert.equal(article.author,'Sample Author');
    assert.equal(article.sourceUrl,undefined);
    assert.doesNotMatch(article.text,/third-party/);
    assert.equal(requests.length,1);
    assert.match(requests[0],/\/feed\/$/);
  } finally { await server.close(); await rm(dataDir,{recursive:true,force:true}); }
});

test('article endpoint only reads Global Voices article URLs',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'study-news-'));
  let calls=0;
  const server=await startServer({dataDir,newsFetch:async()=>{calls++;throw Error('unexpected');}});
  try {
    const response=await fetch(server.url+'/api/news/article?url='+encodeURIComponent('https://www.chinadaily.com.cn/a/202611/10/WS6af26bfde4b03ebf8519b6b4.html'));
    assert.equal(response.status,400);
    assert.equal(calls,0);
  } finally { await server.close(); await rm(dataDir,{recursive:true,force:true}); }
});

test('news attribution and source link persist in practice and saved words',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'study-news-'));
  const server=await startServer({dataDir});
  const url='https://globalvoices.org/2026/11/05/current-developments-in-china/';
  const post=async(path,body)=>{
    const response=await fetch(server.url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.ok(response.ok);
    return response.json();
  };
  try {
    const book=await post('/api/books',{title:'News article',text:'The new project reached several cities. Readers discussed the results.',source:'Global Voices',sourceUrl:url,author:'Sample Author',license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',changes:'仅保留正文段落'});
    await post('/api/article-practice',{bookId:book.id});
    await post('/api/words',{word:'project',context:'The new project reached several cities.',source:'新闻',sourceUrl:url});
    const data=await(await fetch(server.url+'/api/bootstrap')).json();
    const exercise=data.exercises.find(item=>item.bookId===book.id);
    assert.equal(exercise.author,'Sample Author');
    assert.equal(exercise.license,'CC BY 3.0');
    assert.equal(exercise.sourceUrl,url);
    assert.equal(exercise.changes,'仅保留正文段落');
    assert.equal(data.words.find(item=>item.word==='project').sourceUrl,url);
  } finally { await server.close(); await rm(dataDir,{recursive:true,force:true}); }
});
