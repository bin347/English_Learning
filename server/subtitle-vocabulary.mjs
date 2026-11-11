const wordsPattern = /[a-z]+(?:['’-][a-z]+)*/gi;
const stop = new Set(('a an the i you he she it we they me my your his her its our their and or but if of to in on at for with is am are was were be been being have has had do does did will would can could shall should may might must that this these those as so not no yes oh ok okay all just what who why where when how there here up out go get got now then than very too some any from by about into over back well know think want uh um hmm hey one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand am pm a.m p.m o’clock o\'clock monday tuesday wednesday thursday friday saturday sunday january february april june july august september october november december').split(' '));
const phrases = {
  'figure out':'弄明白；想出办法', 'find out':'查明；发现', 'give up':'放弃', 'turn out':'结果是；到场',
  'pick up':'捡起；接人；学会', 'put up with':'忍受', 'run into':'偶遇；遇到', 'get away with':'做了某事而未受惩罚',
  'come up with':'想出；提出', 'get along with':'与……相处', 'get rid of':'摆脱；除掉', 'show up':'出现；到场',
  'look forward to':'期待', 'take care of':'照顾；处理', 'make up':'编造；和好；组成', 'make up my mind':'下定决心',
  'bring up':'提起；抚养', 'call off':'取消', 'hold on':'等一下；坚持住', 'let down':'使失望', 'work out':'解决；锻炼',
  'break down':'出故障；崩溃', 'back off':'后退；别再逼迫', 'cut it out':'别闹了；住手', 'no big deal':'没什么大不了',
  'on the house':'由店家请客', 'hang out':'一起消磨时间', 'pull off':'成功完成', 'deal with':'处理；应对',
  'get over':'从……恢复；克服', 'look into':'调查；查看', 'mess up':'搞砸', 'screw up':'搞砸（非正式）',
  'drop by':'顺道拜访', 'bail out':'解围；退出', 'pass out':'昏倒；分发', 'go through':'经历；检查',
  'take over':'接管', 'keep up with':'跟上', 'look after':'照看', 'come across':'偶然遇见；给人某种印象'
};
const separable = new Set(['figure out','pick up','bring up','call off','let down','work out','pull off','mess up','screw up','bail out']);
const colloquial = {'gonna':'going to 的口语形式','wanna':'want to 的口语形式','gotta':'have got to 的口语形式','kinda':'kind of 的口语形式','outta':'out of 的口语形式'};
const indexes = new WeakMap();
const normalized = text => text.toLowerCase().replaceAll('’', "'");
const seconds = stamp => stamp.replace(',','.').split(':').reduce((total,value)=>total*60+Number(value),0);

export function parseSubtitles(input) {
  const cues = [];
  function add(time,text) {
    const cleaned = text.replace(/<[^>]*>|\{[^}]*\}|\[[^\]]*\]/g,' ')
      .replace(/^\s*[-–]?\s*[A-Z][A-Z .'-]{1,30}:\s*/g,'').replace(/\s+/g,' ').trim();
    if (!cleaned || !/[a-z]/i.test(cleaned) || /^(?:subtitles?|captions?|translated|synced|transcribed)\s+(?:by|from|provided by)\b|https?:\/\/|www\./i.test(cleaned)) return;
    if (cues.at(-1)?.text === cleaned && time-cues.at(-1).time<5) return;
    cues.push({time,text:cleaned});
  }
  if (/^\[Events\]/im.test(input)) {
    for (const row of input.matchAll(/^Dialogue:\s*[^,]*,([\d:.]+),[\d:.]+,(?:[^,]*,){6}(.*)$/gim)) {
      add(seconds(row[1]),row[2].replace(/\\[Nnh]/g,' '));
    }
    return cues;
  }
  for (const block of input.replace(/\r/g,'').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const at = lines.findIndex(line=>/^\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->/.test(line));
    if (at>=0) add(seconds(lines[at].split('-->')[0].trim()),lines.slice(at+1).join(' '));
  }
  return cues;
}

export function vocabularyFromSubtitles(subtitle,dictionary,known=[],limit=20,learning=[]) {
  const cues = parseSubtitles(subtitle);
  const mastered = new Set(known.map(normalized)), pending = new Set(learning.map(normalized));
  let index = indexes.get(dictionary);
  if (!index) {
    const forms = new Map(), roots = new Map(), expressions = new Map();
    for (const [head,entry] of Object.entries(dictionary)) {
      for (const item of (entry.exchange || '').split('/')) {
        const [tag,form] = item.split(':');
        if (!form || form===head) continue;
        if (tag==='0' && dictionary[form]) roots.set(head,form);
        else if (/^[3pdisrt]$/.test(tag)) {
          const previous=forms.get(form);
          const rank=word=>dictionary[word]?.frequency||100000;
          if (!previous || rank(head)<rank(previous)) forms.set(form,head);
        }
      }
      if (head.includes(' ') && entry.meanings?.length) expressions.set(head,entry.meanings.join('；'));
    }
    for (const [phrase,meaning] of Object.entries(phrases)) expressions.set(phrase,meaning);
    const byStart = new Map();
    for (const [word,meaning] of expressions) {
      const tokens = word.split(' ');
      const list = byStart.get(tokens[0]) || [];
      list.push({word,meaning,tokens}); byStart.set(tokens[0],list);
    }
    index = {forms,roots,byStart};
    indexes.set(dictionary,index);
  }
  const rows = cues.map(cue => ({
    ...cue,
    tokens:[...cue.text.matchAll(wordsPattern)].map((match,i,all)=>({
      token:normalized(match[0]),
      cap:/^[A-Z]/.test(match[0]),
      acronym:/^[A-Z]{2,}$/.test(match[0]),
      initial:i===0 || /[.!?]\s*['"“”]*\s*$/.test(cue.text.slice(all[i-1].index+all[i-1][0].length,match.index))
    }))
  }));
  const possibleNames = new Set([...subtitle.matchAll(/^\s*[-–]?\s*([A-Z][A-Z .'-]{1,30}):/gm)]
    .flatMap(match=>normalized(match[1]).match(wordsPattern)||[]));
  for (const {tokens} of rows) {
    const hasLower = tokens.some(token=>!token.cap);
    if (!hasLower) continue;
    for (let i=0;i<tokens.length;i++) {
      const item=tokens[i];
      if (item.cap && (!item.initial || tokens[i+1]?.cap)) possibleNames.add(item.token);
    }
  }
  const candidates = new Map();
  function add(word,meaning,row,phrase=false) {
    if (mastered.has(word)) return;
    const current = candidates.get(word);
    if (current) {
      if (current.lastCue!==row.id) {current.count++; current.lastCue=row.id;}
      return;
    }
    candidates.set(word,{word,meaning,context:row.text,time:row.time,lineId:row.id,count:1,lastCue:row.id,phrase});
  }
  for (const [id,row] of rows.entries()) {
    row.id=id;
    const {tokens}=row;
    const lower = tokens.some(item=>!item.cap);
    const lemmas = tokens.map(({token})=>index.roots.get(token)||index.forms.get(token)||token);
    for (const [i,item] of tokens.entries()) {
      const {token,cap,acronym}=item;
      const lemma=lemmas[i];
      for (const expression of index.byStart.get(lemma)||[]) {
        const {word,meaning,tokens:parts}=expression;
        const adjacent=parts.every((part,j)=>tokens[i+j]?.token===part||lemmas[i+j]===part);
        const split=separable.has(word) && /^(?:it|them|him|her|us|me|you)$/.test(tokens[i+1]?.token||'') && lemmas[i+2]===parts[1];
        if (adjacent || split) add(word,meaning,row,true);
      }
      if (stop.has(token) || stop.has(lemma) || token.length<3) continue;
      if (lower && cap && (acronym || possibleNames.has(token) || /^(?:march|may)$/i.test(token))) continue;
      const entry = dictionary[lemma] || dictionary[token];
      const meaning = entry?.meanings?.join('；') || colloquial[token] || '';
      if (/(?:男子名|女子名|姓氏|人名|地名|专有名词)/.test(meaning) && !(entry?.frequency>0)) continue;
      if (!meaning && (!/^[a-z][a-z'-]{3,30}$/.test(token) || cap && lower)) continue;
      add(entry ? entry.word || lemma : token,meaning,row);
    }
  }
  const ranked = [...candidates.values()].filter(item=>item.meaning || item.count>=2 || pending.has(item.word)).map(item=>{
    const frequency = dictionary[item.word]?.frequency;
    const priority = (pending.has(item.word)?12:0)+(item.phrase?5:0)+(item.meaning?2:0)+Math.min(item.count,4)+
      (frequency>0 && frequency<600?-4:frequency>=1000 && frequency<=20000?2:0);
    const reason = pending.has(item.word)?'生词本或学习记录中待复习':item.phrase?'常用口语搭配':'本集出现 '+item.count+' 次';
    return {item,priority,reason};
  }).sort((a,b)=>b.priority-a.priority || a.item.time-b.item.time || a.item.word.localeCompare(b.item.word));
  const words = ranked.slice(0,limit).map(({item:{lastCue,phrase,...item},reason})=>({...item,reason}));
  // Sample the whole episode so AI can identify expressions beyond dictionary matches.
  const samples = new Set(words.map(word=>word.lineId));
  const stride = Math.max(1,Math.ceil(rows.length/100));
  for (let id=0;id<rows.length;id+=stride) samples.add(id);
  const dialogue = [...samples].sort((a,b)=>a-b).flatMap(id=>{
    const text=rows[id].text;
    return text.length<=320 ? [{id,text}] : [];
  });
  return {words,subtitleCount:cues.length,dialogue};
}
