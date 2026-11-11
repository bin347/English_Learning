import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesMeaning} from '../frontend/src/vocabulary-answer.mjs';
test('written vocabulary answers match any complete listed meaning',()=>{
  const meaning='n. 州, 状态, 国家；a. 国家的, 正式的\nvt. 说明, 陈述';
  for(const answer of ['州','状态','国家','国家的','说明','陈述。']) assert.equal(matchesMeaning(answer,meaning),true,answer);
  for(const answer of ['','国','国家人','不知道']) assert.equal(matchesMeaning(answer,meaning),false,answer);
  assert.equal(matchesMeaning('苹果','n. 苹果, 苹果树；[医] 苹果'),true);
  assert.equal(matchesMeaning('花园','n. 花园/园子'),true);
});
