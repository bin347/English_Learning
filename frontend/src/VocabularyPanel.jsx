import React, { useEffect, useRef, useState } from 'react';
import { matchesMeaning } from './vocabulary-answer.mjs';

function SimilarWords({word,api}) {
    const [words,setWords] = useState([]);
    useEffect(()=>{
        const controller=new AbortController();
        api('/dictionary/similar?q='+encodeURIComponent(word),null,'GET',controller.signal)
            .then(result=>{ if (!controller.signal.aborted) setWords(result.words); })
            .catch(()=>{ /* The answer feedback is usable even when suggestions are unavailable. */ });
        return ()=>controller.abort();
    },[word,api]);
    if (!words.length) return null;
    return <section className="similar-words">
        <h3>拼写近似词</h3>
        <dl>{words.map(entry=><React.Fragment key={entry.word}>
            <dt lang="en">{entry.word}</dt><dd>{entry.meaning}</dd>
        </React.Fragment>)}</dl>
    </section>;
}

function WordPhrases({word,api}) {
    const [phrases,setPhrases] = useState(null);
    useEffect(()=>{
        const controller=new AbortController();
        api('/dictionary/phrases?q='+encodeURIComponent(word),null,'GET',controller.signal)
            .then(result=>{if (!controller.signal.aborted) setPhrases(result.phrases);})
            .catch(()=>{if (!controller.signal.aborted) setPhrases(false);});
        return ()=>controller.abort();
    },[word,api]);
    return <section className="vocabulary-phrases"><h3>词组搭配</h3>{phrases === null ? <p className="quiet">正在加载搭配…</p> : phrases === false ? <p className="quiet">搭配加载失败，请稍后重试。</p> : phrases.length ? <dl>{phrases.map(([phrase,meaning])=><React.Fragment key={phrase}><dt lang="en">{phrase}</dt><dd>{meaning}</dd></React.Fragment>)}</dl> : <p className="quiet">暂未收录该词的搭配。</p>}</section>;
}

function VocabularyChoices({word, meaning, api, disabled, onAnswer}) {
    const [choices, setChoices] = useState(null);
    useEffect(() => {
        const controller = new AbortController();
        api('/vocabulary/choices', {word, meaning}, 'POST', controller.signal)
            .then(result => { if (!controller.signal.aborted) setChoices(result.choices); })
            .catch(() => { if (!controller.signal.aborted) setChoices([]); });
        return () => controller.abort();
    }, [api, word, meaning]);
    if (!choices) return <p className="quiet" role="status">正在生成选项…</p>;
    if (choices.length !== 4) return <p className="quiet" role="alert">暂时无法生成四个选项，可跳过此词或切换到中文填空。</p>;
    return <div className="choices">
        {choices.map(choice => <button key={choice.word} disabled={disabled} onClick={() => onAnswer(choice.word === word)}>{choice.meaning}</button>)}
    </div>;
}

export default function VocabularyPanel({ api, run, busy, refresh, speak, words, onBook, target, round, setRound, books: libraryBooks }) {
    const [handled,HD]=useState([]),[cursor,CU]=useState(0),[loading,setLoading]=useState(true);
    const [books,BS]=useState([]),[book,BK]=useState('cet4'),[state,ST]=useState('new'),[mode,MD]=useState('fill'),[rows,RS]=useState([]),[total,TT]=useState(0),[offset,OF]=useState(0),[feedback,FB]=useState(null),[answer,AN]=useState('');
    const [progressReady,setProgressReady]=useState(false);
    const [bookProgress,setBookProgress]=useState(null), [savedProgress,setSavedProgress]=useState(null);
    const roundWords=round.book===book && round.state===state ? round.words : [];
    const setRoundWords=update=>setRound(previous=>({book,state,words:typeof update==='function'?update(previous.book===book && previous.state===state?previous.words:[]):update}));
    useEffect(()=>{if(progressReady) setRound(previous=>previous.book===book && previous.state===state?previous:{book,state,words:[]});},[book,state,progressReady]);
    useEffect(()=>{
        if(mode!=='list') return;
        const controller=new AbortController();
        setSavedProgress(null);
        api('/vocabulary?book=saved&state=learning&limit=1',null,'GET',controller.signal).then(data=>setSavedProgress(data.summary)).catch(error=>{if(error.name!=='AbortError') run(async()=>{throw error;});});
        return ()=>controller.abort();
    },[mode,words.length,api]);
    const displayedProgress=mode==='list'?savedProgress:bookProgress;
    async function updateBookProgress() {
        const data=await api(`/vocabulary?book=${book}&state=${state}&limit=1`);
        setBookProgress(data.summary);
    }
    useEffect(()=>{if(progressReady && book==='saved') updateBookProgress().catch(()=>run(async()=>{throw Error('词书进度读取失败');}));},[words.length]);
    const resume=useRef(null), progressQueue=useRef(Promise.resolve());
    useEffect(()=>{api('/practice-progress').then(progress=>{const saved=progress.vocabulary; if(saved && !target){resume.current=saved; BK(saved.book||'cet4'); ST(saved.state||'new'); MD(saved.mode||'fill'); OF(saved.offset||0); HD(saved.handled||[]); setRound({book:saved.book||'cet4',state:saved.state||'new',words:saved.roundWords||[]});} setProgressReady(true);}).catch(()=>run(async()=>{throw Error('单词练习进度读取失败，请检查本地服务。');}));},[]);
    useEffect(()=>{if(target){setLoading(true);resume.current=null;BK(target.book);ST(target.state);OF(0);MD('fill');HD([]);CU(0)}},[target?.token]);
    async function load(restoring=false) { const d=await api(`/vocabulary?book=${book}&state=${state}&limit=60&offset=${offset}`);RS(d.words);TT(d.total);setBookProgress(d.summary);if(restoring && resume.current){const saved=resume.current; const available=d.words.filter(w=>!(saved.handled||[]).includes(w.word)); CU(Math.max(0,available.findIndex(w=>w.word===saved.word))); FB(saved.feedback||null); AN(saved.answer||''); resume.current=null;}else{FB(null);AN('');}return d; }
    useEffect(()=>{run(async()=>BS(await api('/vocabulary/books')));},[]);
    useEffect(()=>{if(!progressReady)return; if(!resume.current){HD([]);CU(0);} setLoading(true);run(()=>load(true)).finally(()=>setLoading(false));},[book,state,offset,progressReady]);
    const available=rows.filter(w=>!handled.includes(w.word));
    const current=feedback?.word || available[cursor%Math.max(1,available.length)];
    useEffect(()=>{if(!progressReady||loading)return; const value={book,state,mode,offset,handled,word:current?.word||'',answer,feedback,roundWords}; progressQueue.current=progressQueue.current.catch(()=>{}).then(()=>fetch('/api/practice-progress',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({vocabulary:value}),keepalive:true})).then(r=>{if(!r.ok)throw Error('保存失败');}).catch(()=>run(async()=>{throw Error('单词练习进度保存失败，请检查本地服务。');}));},[progressReady,loading,book,state,mode,offset,handled,current?.word,answer,feedback,round]);
    async function submit(correct) {
        let addedId='';
        if (!correct && !words.some(w=>w.word.toLowerCase()===current.word.toLowerCase())) {
            const added=await api('/words',{word:current.word,meaning:current.meaning,context:current.context||'',bookId:current.bookId,location:current.location});addedId=added.id;
        }
        await api('/vocabulary/progress',{word:current.word,action:correct?'remembered':'again',book});
        setRoundWords(items=>items.includes(current.word)?items:[...items,current.word]);
        FB({correct,addedId,word:current});await updateBookProgress();await refresh();
    }
    async function override() {
        if(feedback.addedId) await api('/words/'+feedback.addedId,null,'DELETE');
        await api('/vocabulary/progress',{word:current.word,action:'remembered',book});
        FB({correct:true,overridden:true,word:current});await updateBookProgress();await refresh();
    }
    async function next() {
        if(feedback) {
            setLoading(true);
            const done=[...handled,current.word];HD(done);CU(0);
            const d=await load();
            if(!d.words.some(w=>!done.includes(w.word)) && offset+d.words.length<d.total) {OF(offset+d.words.length);} else setLoading(false);
        } else if(cursor+1<available.length) {CU(cursor+1);AN('');}
        else if(offset+rows.length<total) {setLoading(true);OF(offset+rows.length);CU(0);}
        else {CU(0);AN('');}
    }
    async function mastered() {setLoading(true);await api('/vocabulary/progress',{word:current.word,action:'mastered',book});setRoundWords(items=>items.includes(current.word)?items:[...items,current.word]);HD(items=>[...items,current.word]);CU(0);await refresh();await load();setLoading(false);}
    return <div className="vocabulary-panel"><div className="filter-row"><label>词书<select value={book} onChange={e=>{setLoading(true);BK(e.target.value);if(['saved','learned'].includes(e.target.value))ST('learning');OF(0);}}>{books.map(b=><option key={b.id} value={b.id}>{b.title} · {b.id==='saved' ? words.length : b.count} 词</option>)}</select></label><label>学习状态<select value={state} onChange={e=>{setLoading(true);ST(e.target.value);OF(0);}}><option value="new">新词</option><option value="learning">在学</option><option value="review">到期复习</option><option value="mastered">已掌握</option></select></label></div>{displayedProgress && <section className="vocab-progress" aria-label={mode==='list'?'生词本学习进度':'词书学习进度'}><div><span>{mode==='list'?'生词本已学习':'已学习'} <b>{displayedProgress.studied} / {displayedProgress.total}</b> 词</span><span>{displayedProgress.total ? (displayedProgress.studied > 0 && displayedProgress.studied / displayedProgress.total * 100 < 0.1 ? '<0.1' : (displayedProgress.studied / displayedProgress.total * 100).toFixed(1)) : '0.0'}%</span></div><progress aria-label="词书已学习比例" value={displayedProgress.studied} max={displayedProgress.total || 1}/><p>已掌握 {displayedProgress.mastered} 词 · 学习中 {displayedProgress.learning} 词 {mode!=='list' && <span>本轮已完成 {roundWords.length} 词</span>}</p></section>}<div className="tabs"><button className={mode==='fill'?'selected':''} onClick={()=>{MD('fill');FB(null);AN('');}}>中文填空</button><button className={mode==='choice'?'selected':''} onClick={()=>{MD('choice');FB(null);AN('');}}>选择题</button><button className={mode==='list'?'selected':''} onClick={()=>MD('list')}>我的生词本 · {words.length}</button></div>{loading?<section className="panel empty"><p>正在加载单词…</p></section>:mode==='list'?<section className="panel">{!words.length&&<p className="quiet">这里只收录你主动收藏或练习答错的生词。</p>}{words.map(w=><div className="row" key={w.id}><div><b>{w.word}</b><p>{w.meaning}</p><small>{w.context}</small></div><button onClick={()=>speak(w.word)}>朗读</button><button onClick={()=>{if(book!=='saved'||state!=='learning'||offset!==0)setLoading(true);BK('saved');ST('learning');MD('fill');OF(0);}}>进入生词复习</button>{w.bookId&&(!libraryBooks||libraryBooks.some(b=>b.id===w.bookId))&&<button onClick={()=>onBook(w)}>返回原文</button>}{w.bookId&&libraryBooks&&!libraryBooks.some(b=>b.id===w.bookId)&&<span>原书已删除</span>}<button onClick={()=>run(async()=>{await api('/words/'+w.id,null,'DELETE');await refresh();})}>移除</button></div>)}</section>:!current?<section className="panel empty"><h2>{state==='review'?'本轮复习已完成':'此状态暂无单词'}</h2><p>你可以切换词书或学习状态继续。</p></section>:<section className="panel quiz"><p className="quiet">{books.find(b=>b.id===book)?.title} · 当前筛选 {total} 词</p><h2>{current.word}</h2><p>{current.phonetic}</p><button onClick={()=>speak(current.word)}>朗读</button>{current.context&&<p>{current.context}</p>}{mode==='choice'?(current.meaning?.trim() && <VocabularyChoices key={JSON.stringify([current.word,current.meaning])} word={current.word} meaning={current.meaning} api={api} disabled={busy||!!feedback} onAnswer={correct=>run(()=>submit(correct))}/>):<form onSubmit={e=>{e.preventDefault();run(()=>submit(matchesMeaning(answer,current.meaning)));}}><label>写出一个中文意思<input aria-label="中文意思" value={answer} onChange={e=>AN(e.target.value)} disabled={busy||!!feedback} placeholder="输入一个词典中的释义"/></label><button className="primary" disabled={busy||!!feedback||!current.meaning?.trim()||!answer.trim()}>提交答案</button></form>}{!current.meaning?.trim()&&<p className="quiet">该词暂无释义，暂时无法判断答案，请先跳过或补充释义。</p>}{feedback&&<div className="word-feedback" aria-live="polite"><p>{feedback.correct?(feedback.overridden?'已按回答正确处理。':'回答正确！'): '未匹配词典释义，已加入生词本并安排复习。'}</p><p><b>完整释义：</b>{current.meanings?.join('；') || current.meaning || '暂无释义'}</p><SimilarWords key={current.word} word={current.word} api={api}/><WordPhrases key={current.word} word={current.word} api={api}/>{!feedback.correct&&mode==='fill'&&<><p className="quiet">系统按词典中的字面释义比对，未收录的同义词可能被误判。</p><button disabled={busy} onClick={()=>run(override)}>我答对了，纠正误判</button></>}</div>}<div className="actions"><button disabled={busy} onClick={()=>run(next)}>{feedback?'下一词':'跳过此词'}</button>{state!=='mastered'&&!feedback&&<button disabled={busy} onClick={()=>run(mastered)}>标为已掌握</button>}<button disabled={busy||words.some(w=>w.word.toLowerCase()===current.word.toLowerCase())} onClick={()=>run(async()=>{await api('/words',{word:current.word,meaning:current.meaning,context:current.context||'',bookId:current.bookId,location:current.location});await refresh();})}>加入生词本</button></div></section>}</div>;
}
