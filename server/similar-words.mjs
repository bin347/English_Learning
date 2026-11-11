// An adjacent swap, such as quiet → quite, counts as one spelling change.
function spellingDistance(word, candidate) {
  let older = [], previous = Array.from({length:candidate.length+1},(_,i)=>i), row = [];
  for (let i=1;i<=word.length;i++) {
    row[0]=i;
    for (let j=1;j<=candidate.length;j++) {
      row[j]=Math.min(previous[j]+1,row[j-1]+1,previous[j-1]+Number(word[i-1]!==candidate[j-1]));
      if (i>1 && j>1 && word[i-1]===candidate[j-2] && word[i-2]===candidate[j-1]) {
        row[j]=Math.min(row[j],older[j-2]+1);
      }
    }
    [older,previous,row]=[previous,row,older];
  }
  return previous[candidate.length];
}

const rootOf = (word,dictionary) => /(?:^|\/)0:([a-z]+)(?=\/|$)/.exec(dictionary[word]?.exchange || '')?.[1] || word;

function wordFamily(word,dictionary) {
  const root=rootOf(word,dictionary);
  const forms=new Set([word,root]);
  for (const head of new Set([word,root])) {
    const exchange=dictionary[head]?.exchange || '';
    for (const [,form] of exchange.matchAll(/(?:^|\/)[03pdisrt]:([a-z]+)(?=\/|$)/g)) forms.add(form);
  }
  return {root,forms};
}

export function similarWords(input,dictionary,commonWords,limit=3) {
  const word=input.trim().toLowerCase();
  if (!/^[a-z]{3,40}$/.test(word)) return [];
  const {root,forms}=wordFamily(word,dictionary);
  const threshold=word.length<6?1:2;
  const matches=[];
  for (const entry of commonWords) {
    const candidate=entry.word;
    if (Math.abs(candidate.length-word.length)>threshold || !/^[a-z]{3,40}$/.test(candidate) ||
        forms.has(candidate) || rootOf(candidate,dictionary)===root || !entry.meanings[0]?.trim()) continue;
    const distance=spellingDistance(word,candidate);
    if (distance>0 && distance<=threshold) matches.push({entry,distance});
  }
  // commonWords is ordered by general usage frequency, so ties favor useful words.
  return matches.sort((a,b)=>a.distance-b.distance).slice(0,limit)
    .map(({entry})=>({word:entry.word,meaning:entry.meanings[0]}));
}

const glosses = meaning => meaning.replace(/\([^)]*\)|（[^）]*）/g,'').split(/[,，;；、/\n]+/)
  .map(part=>part.replace(/^\s*(?:[a-z]+\.\s*|\[[^\]]+\]\s*|【[^】]+】\s*)+/i,'').trim())
  .filter(Boolean);
const glossKey = gloss => gloss.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const isChinese = gloss => /\p{Script=Han}/u.test(gloss);
const partOfSpeech = meaning => meaning.match(/^\s*([a-z]+)\./i)?.[1].replace(/^(?:vt|vi)$/,'v').replace(/^adj$/,'a');

function shuffle(items) {
  for (let i=items.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [items[i],items[j]]=[items[j],items[i]];
  }
  return items;
}

export function vocabularyChoices(word,meaning,dictionary,commonWords) {
  const head=word.trim().toLowerCase(), entry=dictionary[head];
  const {forms:usedWords}=wordFamily(head,dictionary);
  const definitions=glosses(meaning);
  const answer=definitions.find(isChinese) || definitions[0] || meaning.trim();
  const choices=[{word,meaning:answer}];
  // Include dictionary senses even when a saved word has a shorter custom definition.
  const usedGlosses=[answer,...definitions,...glosses(entry?.meanings.join('；') || '')].map(glossKey).filter(Boolean);
  function add(candidate) {
    if (usedWords.has(candidate.word) || rootOf(candidate.word,dictionary)!==candidate.word) return;
    for (const gloss of glosses(candidate.meanings.join('；'))) {
      if (!isChinese(gloss)) continue;
      const key=glossKey(gloss);
      if (usedGlosses.some(used=>used.includes(key) || key.includes(used))) continue;
      choices.push({word:candidate.word,meaning:gloss});
      usedWords.add(candidate.word);
      usedGlosses.push(key);
      return;
    }
  }
  const rank=entry?.frequency || 3000;
  const maxRank=Math.max(10000,rank*4);
  for (const match of similarWords(head,dictionary,commonWords,20)) {
    const candidate=dictionary[match.word];
    if (candidate.frequency<=maxRank) add(candidate);
    if (choices.length===4) return shuffle(choices);
  }
  const index=commonWords.findIndex(candidate=>candidate.frequency>=rank);
  const nearby=shuffle(commonWords.slice(Math.max(0,index-100),index+101));
  const pos=partOfSpeech(entry?.meanings[0] || meaning);
  for (const candidate of nearby) {
    if (pos && partOfSpeech(candidate.meanings[0] || '')===pos) add(candidate);
    if (choices.length===4) return shuffle(choices);
  }
  for (const candidate of nearby) {
    add(candidate);
    if (choices.length===4) break;
  }
  return shuffle(choices);
}
