import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSubtitles,vocabularyFromSubtitles} from './catalog-media.mjs';

test('SRT/VTT parsing preserves time and removes presentation markup',()=>{
  assert.deepEqual(parseSubtitles('WEBVTT\n\n00:01.000 --> 00:03.000\n<v speaker>Hello garden.</v>\n\n2\n00:00:04,500 --> 00:00:06,000\nWonderful day.'),[{time:1,text:'Hello garden.'},{time:4.5,text:'Wonderful day.'}]);
});
test('Vocabulary uses lemmas, counts, context and learned-word exclusion',()=>{
  const dictionary={garden:{meanings:['花园']},wonderful:{meanings:['精彩的']},flower:{meanings:['花'],exchange:'s:flowers'}};
  const subtitle='1\n00:00:01,000 --> 00:00:05,000\nWonderful garden flowers.\n\n2\n00:00:06,000 --> 00:00:08,000\nWonderful flowers.';
  const result=vocabularyFromSubtitles(subtitle,dictionary,['garden']);
  assert.equal(result.subtitleCount,2);assert.equal(result.words.length,2);
  assert.equal(result.words.find(w=>w.word==='flower').count,2);
  assert.equal(result.words.some(w=>w.word==='garden'),false);
});

test('subtitle candidates prioritize words still being learned while excluding mastered words',()=>{
  const dictionary={garden:{meanings:['花园']},flower:{meanings:['花']},wonderful:{meanings:['精彩的']}};
  const subtitle='1\n00:00:01,000 --> 00:00:05,000\nWonderful garden flower.\n\n2\n00:00:06,000 --> 00:00:08,000\nWonderful garden.';
  const result=vocabularyFromSubtitles(subtitle,dictionary,['garden'],20,['flower']);
  assert.equal(result.words[0].word,'flower');
  assert.equal(result.words[0].reason,'生词本或学习记录中待复习');
  assert.equal(result.words.some(word=>word.word==='garden'),false);
  assert.equal(result.words.find(word=>word.word==='wonderful').count,2);
});

test('preview drops subtitle noise, names and calendar markers while keeping out-of-book expressions',()=>{
  const dictionary={
    figure:{meanings:['理解'],exchange:'p:figured'},
    frank:{meanings:['率直的'],frequency:8225},
    london:{meanings:['伦敦']},
    workaround:{meanings:['变通办法']},
    march:{meanings:['行进；三月']}
  };
  const subtitle=[
    'FRANK: I figured it out in London on March 4 at 7 p.m.',
    '[Door slams] Frank, the workaround is useful.',
    'We march at sunrise.',
    'Subtitles by Example'
  ].map((line,i)=> (i+1)+'\n00:00:0'+(i+1)+',000 --> 00:00:0'+(i+2)+',000\n'+line).join('\n\n');
  const result=vocabularyFromSubtitles(subtitle,dictionary);
  const names=result.words.map(item=>item.word);
  assert.ok(names.includes('figure out'));
  assert.ok(names.includes('workaround'));
  assert.equal(result.words.find(item=>item.word==='march').count,1);
  for (const name of ['frank','london','door','slams','subtitles','example']) assert.ok(!names.includes(name),name);
  assert.equal(result.dialogue.length,3);
});

test('ASS dialogue stays usable if a provider has no SRT version',()=>{
  const subtitle='[Script Info]\nTitle: Test\n[Events]\nDialogue: 0,0:00:01.20,0:00:02.50,Default,,0,0,0,,{\\i1}Hi.\\NWelcome.';
  assert.deepEqual(parseSubtitles(subtitle),[{time:1.2,text:'Hi. Welcome.'}]);
});
