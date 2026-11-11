import React, { useEffect, useRef, useState } from 'react';

const providerNames = {archive:'影片自带字幕',subtitledb:'SubtitleDB',gestdown:'Gestdown',yify:'YIFY Subtitles'};
const numerals = '零一二三四五六七八九';

function numberOf(value) {
  if (!value) return '';
  if (/^\d+$/.test(value)) return String(Number(value));
  if (value==='两') return '2';
  if (value.includes('十')) {
    const [tens,ones]=value.split('十');
    return String((tens?numerals.indexOf(tens):1)*10+(ones?numerals.indexOf(ones):0));
  }
  return String(numerals.indexOf(value));
}

function mediaQuery(media,episode) {
  const label = media.episodes?.[episode]?.label || media.episodes?.[episode]?.title || '';
  const title = media.title || '';
  const code = /\bS(\d{1,2})[ ._-]*E(\d{1,3})\b/i.exec(label);
  const seasonText = title + ' ' + label;
  const season = code?.[1] || /第\s*([0-9一二三四五六七八九十两]+)\s*季/.exec(seasonText)?.[1] || /\b(?:Season\s+|S)(\d{1,2})\b/i.exec(seasonText)?.[1];
  const number = code?.[2] || /第\s*([0-9一二三四五六七八九十两]+)\s*[集话]/.exec(label)?.[1] || /(?:episode\s*|\bEP?\.?\s*|^)(\d{1,3})\b/i.exec(label)?.[1];
  return {
    title:(media.originalTitle||title).replace(/第\s*[0-9一二三四五六七八九十两]+\s*季|\b(?:Season\s+|S)\d{1,2}\b/gi,'').trim(),
    season:numberOf(season),number:numberOf(number),
    year:media.year && (media.type!=='tv' || Number(numberOf(season))===1) ? String(media.year) : '',
    imdbId:media.imdbId || ''
  };
}

export default function MediaPreview({media,episode,api,run,busy,settings,refresh,speak,savedWords,addCandidate}) {
  const query = mediaQuery(media,episode);
  const [sources,setSources] = useState([]), [status,setStatus] = useState('');
  const [resolvedTitle,setResolvedTitle] = useState(null);
  const [local,setLocal] = useState(null), [enhanced,setEnhanced] = useState(null);
  const [dismissed,setDismissed] = useState([]), [limit,setLimit] = useState(20);
  const [pending,setPending] = useState(false);
  const active = useRef(null);
  const type = media.type==='tv' ? 'tv' : 'movie';
  const canSearch = q => !!q.title.trim() && (type==='movie'||(+q.season>=1&&+q.number>=1));
  const aiEnabled = settings.apiUses?.includes('media') && !!settings.apiBase && !!settings.model;
  const words = (enhanced?.words || local?.words || []).filter(word=>!dismissed.includes(word.word));
  const supplied = (media.subtitles || []).filter(track=>!track.language || /^(en|eng|english)(?:[-_]\w+)?$/i.test(track.language))
    .map(track=>({provider:'archive',id:track.url,title:media.title,label:track.name}));

  async function request(fn) {
    active.current?.abort();
    const controller=new AbortController();
    active.current=controller;
    setPending(true);
    try { await fn(controller.signal); }
    catch(error) {
      if (!controller.signal.aborted) setStatus(error.message || '请求失败，请重试。');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  async function choose(item,signal) {
    const data = item.provider==='archive'
      ? await api('/media/subtitle?url='+encodeURIComponent(item.id),null,'GET',signal)
      : await api('/media/subtitle-download',{provider:item.provider,id:item.id},'POST',signal);
    const result = await api('/media/vocabulary',{subtitle:data.subtitle,limit:50},'POST',signal);
    if (!result.subtitleCount || !result.dialogue.length) throw Error('没有读到可用对白，请尝试其他字幕。');
    if (signal.aborted) return;
    setLocal({...result,source:providerNames[item.provider]});
    setEnhanced(null);
    setStatus(result.words.length?'已按对白生成本地预习词卡。':'这份字幕里没有找到适合的本地词卡，可尝试 AI 精选。');
  }

  async function search(q,signal) {
    setStatus('正在查找英文字幕…');
    setResolvedTitle(null);
    setSources(supplied);
    setEnhanced(null);
    setLocal(null);
    setDismissed([]);
    const selectedTrack = media.episodes?.[episode];
    const stem = name=>name.toLowerCase().replace(/\.(?:mp4|srt|vtt)$/,'').replace(/[._-](?:en|eng|english)$/,'');
    const matchingTrack = supplied.find(track=>selectedTrack && stem(track.label)===stem(selectedTrack.title));
    const attached = matchingTrack || (type==='movie' && media.episodes?.length===1 && supplied.length===1 ? supplied[0] : null);
    if (attached) {
      try { await choose(attached,signal); return; }
      catch(error) { if (signal.aborted) throw error; }
    }
    if (!canSearch(q)) {
      setStatus('影视来源未提供可识别的片名、季数或集数，无法自动查找字幕。可以尝试其他影视来源或直接播放。');
      return;
    }
    const found=await api('/media/subtitle-search',{
      title:q.title.trim(),type,imdbId:q.imdbId,year:Number(q.year),
      ...(type==='tv'?{season:+q.season,episode:+q.number}:{})
    },'POST',signal);
    if (signal.aborted) return;
    if (found.resolvedTitle) setResolvedTitle({title:found.resolvedTitle,year:found.resolvedYear});
    setSources([...supplied,...found.sources]);
    // Try one confirmed candidate per provider before trying more versions manually.
    const tried = new Set();
    for (const item of found.sources) {
      if (!item.exact || tried.has(item.provider)) continue;
      tried.add(item.provider);
      try { await choose(item,signal); return; }
      catch(error) { if (signal.aborted) throw error; }
    }
    if (found.sources.length || supplied.length) setStatus('请核对版本，选择对应影片或剧集的字幕。');
    else setStatus('未找到可用的英文字幕。' + (found.warnings.length ? found.warnings.join('，')+'。' : '') +
      (/[\u3400-\u9fff]/.test(q.title) && !found.resolvedTitle ? '未能确认英文原名。' : '') +
      (aiEnabled?'可以试试 AI 题材预热，或直接播放。':'可以尝试其他影视来源或直接播放。'));
  }

  useEffect(()=>{
    void request(signal=>search(query,signal));
    return ()=>active.current?.abort();
  },[]);

  async function aiPreview(signal) {
    setStatus('正在整理预习词卡…');
    try {
      const result = await api('/media/ai-preview',{
        title:query.title,episode:type==='tv'&&query.number?'第 '+query.season+' 季第 '+query.number+' 集':'',
        dialogue:local?.dialogue || [], limit
      },'POST',signal);
      if (signal.aborted) return;
      setEnhanced(result);
      setStatus(result.grounded?'AI 已结合字幕解释词义与用法。':'这些词与影视题材相关，未验证在影片中出现。');
    } catch(error) {
      if (!signal.aborted) {
        setEnhanced(null);
        setStatus(local?'AI 精选暂不可用，已显示本地筛词。':'AI 预热暂不可用，可以重试或直接播放。');
      }
    }
  }

  return <section className="media-preview" style={{marginTop:24}} aria-label="观影前预习">
    <h3>观影前预习</h3>
    <p className="quiet">程序会联网查找英文字幕。字幕版本可能与播放线路不同。</p>
    <form onSubmit={event=>{event.preventDefault();void request(signal=>search(query,signal));}}>
      <div className="actions">
        <button disabled={pending}>重新搜索字幕</button>
        {aiEnabled&&<button type="button" disabled={pending||!query.title.trim()} onClick={()=>request(aiPreview)}>{local?'AI 精选':'AI 题材预热'}</button>}
        {enhanced&&local&&<button type="button" onClick={()=>{setEnhanced(null);setStatus('已显示本地筛词。');}}>查看本地筛词</button>}
      </div>
    </form>
    {aiEnabled&&<p className="quiet">点击 AI 预习会向配置的模型发送片名及部分字幕对白。</p>}
    {resolvedTitle&&<p className="quiet">识别到原片名 {resolvedTitle.title}（{resolvedTitle.year}），请核对版本。</p>}
    <p role="status">{status}</p>
    {(enhanced||local)&&<p className="quiet">预习依据：{enhanced ? enhanced.grounded ? 'AI 精选 · '+local.source : 'AI 题材预热' : local.source}</p>}
    {!!sources.length&&<details open={!local&&!enhanced}><summary>字幕版本（{sources.length}）</summary>
      {sources.map(item=><div className="row" key={item.provider+item.id}>
        <span>{[item.title,item.year,item.label,providerNames[item.provider]].filter(Boolean).join(' · ')}</span>
        <button disabled={pending} onClick={()=>request(signal=>choose(item,signal))}>使用字幕</button>
      </div>)}
    </details>}
    {(!!words.length||aiEnabled)&&<label>预习数量<select value={limit} onChange={e=>setLimit(+e.target.value)}>
      <option value="15">15 词</option><option value="20">20 词</option><option value="30">30 词</option>
    </select></label>}
    {enhanced && words.length < limit && <p className="quiet">当前有 {words.length} 条 AI 词卡，如需更多可重新生成；实际数量取决于可用材料。</p>}
    {words.slice(0,limit).map(word=>{
      const saved=savedWords.some(item=>item.word.toLowerCase()===word.word.toLowerCase());
      const dismiss=()=>setDismissed(items=>[...items,word.word]);
      return <div className="row" key={word.word}>
        <div><button onClick={()=>speak(word.word)}>{word.word}</button>
          <p>{word.meaning||'本地词典未收录，可结合原句理解。'}</p><small>{word.reason}</small>
          {word.context&&<details><summary>查看原句</summary><p>{word.context}</p></details>}
        </div>
        <div className="actions">
          <button disabled={busy} onClick={()=>run(async()=>{await api('/media/known',{word:word.word});dismiss();await refresh();})}>认识</button>
          <button disabled={busy||saved} onClick={()=>run(()=>addCandidate(word))}>{saved?'已加入':'加入生词本'}</button>
          <button onClick={dismiss}>跳过</button>
        </div>
      </div>;
    })}
  </section>;
}
