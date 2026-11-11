import React, { useState, useEffect, useRef } from 'react';
import './practice-compact.css';

let draftQueue = Promise.resolve();

export default function PracticePanel({ kind, active, exercises, attempts, initialId, initialArticleId, jumpToken, api, refresh, run, busy, speak, words, onBook, books }) {
    const listening = kind === 'listening';
    const [id, ID] = useState(initialId || ''), [level, LV] = useState('all'), [topic, TP] = useState('all'), [source, SO] = useState('all');
    const [mode, MD] = useState('english'), [drafts, DS] = useState({}), [results, RS] = useState({}), [show, SH] = useState(false), [rate, RT] = useState(1);
    const [progressReady, setProgressReady] = useState(false);
    const [style, setStyle] = useState('single'), [articleId, setArticleId] = useState(''), [bookChoice, setBookChoice] = useState('');
    const positions = useRef({}), singleId = useRef('');
    const [draftReady, setDraftReady] = useState(false), [draftError, setDraftError] = useState('');
    const [historyFilter, setHistoryFilter] = useState('all'), [historyLimit, setHistoryLimit] = useState(8);
    const pendingDrafts = useRef(new Map()), audioRef = useRef(null);
    const [audioError, setAudioError] = useState(''), [assistance, setAssistance] = useState(null);
    const [feedbackKey, setFeedbackKey] = useState(null), [feedbackTab, setFeedbackTab] = useState('overview');
    const feedbackDialog = useRef(null), answerInput = useRef(null), feedbackOpener = useRef(null);
    const [hint, HT] = useState(null), [onlineQuery, OQ] = useState(''), [onlineResults, OR] = useState([]), [searched, SQ] = useState(false), [editing, ED] = useState(false), [keywordDraft, KD] = useState('');
    useEffect(() => {
        api('/practice-progress').then(progress => {
            const saved = progress[kind];
            if (saved && !initialId) { ID(saved.id || ''); LV(saved.level || 'all'); TP(saved.topic || 'all'); SO(saved.source || 'all'); if (listening) MD(saved.mode || 'english'); setStyle(saved.practiceStyle || 'single'); setArticleId(saved.articleId || ''); positions.current = saved.positions || {}; singleId.current = saved.singleId || (saved.practiceStyle === 'article' ? '' : saved.id || ''); }
            setProgressReady(true);
        }).catch(() => { setDraftError('练习进度读取失败，请检查本地服务。'); });
    }, []);
    useEffect(() => { if (initialId) { setStyle('single'); ID(initialId); LV('all'); TP('all'); SO('all'); SH(false); HT(null); } }, [initialId, jumpToken]);
    useEffect(() => { if (initialArticleId) { setStyle('article'); setArticleId(initialArticleId); ID(''); SH(false); HT(null); } }, [initialArticleId, jumpToken]);
    const articles = [...new Map(exercises.filter(e => e.articleId).map(e => [e.articleId, { id: e.articleId, title: e.articleTitle }])).values()];
    const activeArticle = articleId || articles[0]?.id || '';
    const filtered = exercises.filter(e => (style === 'article' ? e.articleId === activeArticle : !e.articleId && (level === 'all' || e.level === level) && (topic === 'all' || e.topic === topic) && (source === 'all' || (source === 'reading' ? e.bookId && e.source !== '内置' : source === 'online' ? e.source === 'Tatoeba' : source === 'audio' ? e.audioUrl : (!e.bookId || e.source === '内置') && e.source !== 'Tatoeba'))));
    const current = filtered.find(e => e.id === id) || filtered[0];
    useEffect(() => {
        if (!progressReady || !current) return;
        if (style === 'article') positions.current[activeArticle] = current.id; else singleId.current = current.id;
        draftQueue = draftQueue.then(() => fetch('/api/practice-progress', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [kind]: { id: current.id, level, topic, source, mode, practiceStyle: style, articleId: activeArticle, singleId: singleId.current, positions: {...positions.current} } }), keepalive: true })).then(response => { if (!response.ok) throw new Error('保存失败'); }).catch(() => setDraftError('练习进度保存失败，请检查本地服务。'));
    }, [progressReady, current?.id, level, topic, source, mode, style, activeArticle]);
    useEffect(() => { setAudioError(''); return () => window.speechSynthesis?.cancel(); }, [current?.id]);
    const key = (current?.id || '') + ':' + (listening ? mode : 'chinese');
    const answer = drafts[key] || '';
    const lastAttempt = attempts.findLast(a => a.exerciseId === current?.id && a.practiceType === kind && a.answerMode === (listening ? mode : 'chinese'));
    const saved = results[key] || (lastAttempt ? { result: lastAttempt.result, mode: lastAttempt.mode, answer: lastAttempt.answer } : null), result = saved?.result;
    const feedbackVisible = active && !!result && feedbackKey === key;
    useEffect(() => { if (feedbackVisible) feedbackDialog.current?.showModal(); }, [feedbackVisible]);
    useEffect(() => { if (!active) setFeedbackKey(null); }, [active]);
    useEffect(() => { if (feedbackKey && feedbackKey !== key) setFeedbackKey(null); }, [key]);
    const history = attempts.filter(a => a.practiceType === kind);
    const exerciseById = new Map(exercises.map(exercise => [exercise.id, exercise]));
    const visibleHistory = history.filter(a => {
        const exercise = exerciseById.get(a.exerciseId);
        if (historyFilter === 'reading') return exercise?.bookId && exercise.source !== '内置';
        if (historyFilter === 'review') return (typeof a.result?.score === 'number' && a.result.score < 80) || a.result?.issues?.length;
        return true;
    }).slice().reverse();
    function persistDraft(draftKey, value) {
        draftQueue = draftQueue.then(() => fetch('/api/practice-drafts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: kind + ':' + draftKey, value }), keepalive: true }))
            .then(response => { if (!response.ok) throw new Error('保存失败'); setDraftError(''); }).catch(() => setDraftError('草稿保存失败，请检查本地服务后重新输入或清空答案。'));
    }
    function flushDraft(draftKey) {
        const pending = pendingDrafts.current.get(draftKey);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingDrafts.current.delete(draftKey);
        persistDraft(draftKey, pending.value);
    }
    function updateDraft(draftKey, value) {
        DS(previous => ({ ...previous, [draftKey]: value }));
        clearTimeout(pendingDrafts.current.get(draftKey)?.timer);
        const timer = setTimeout(() => flushDraft(draftKey), 350);
        pendingDrafts.current.set(draftKey, { value, timer });
    }
    useEffect(() => {
        api('/practice-drafts').then(({ drafts: stored }) => {
            DS(Object.fromEntries(Object.entries(stored).filter(([key]) => key.startsWith(kind + ':')).map(([key, value]) => [key.slice(kind.length + 1), value])));
            setDraftReady(true);
        }).catch(() => { setDraftError('草稿读取失败，请检查本地服务并重新打开程序。'); setDraftReady(true); });
        const flushAll = () => { for (const draftKey of pendingDrafts.current.keys()) flushDraft(draftKey); };
        window.addEventListener('pagehide', flushAll);
        return () => { window.removeEventListener('pagehide', flushAll); flushAll(); };
    }, []);
    const candidates = [...(result?.suggestedWords || []), ...(result?.details || []).filter(w => !w.matched)].filter((w, i, a) => a.findIndex(x => (x.word || x.english) === (w.word || w.english)) === i);
    function closeFeedback(edit = false) {
        setFeedbackKey(null);
        requestAnimationFrame(() => (edit ? answerInput.current : feedbackOpener.current)?.focus());
    }
    function selectExercise(nextId) { setFeedbackKey(null); ID(nextId); SH(false); HT(null); ED(false); KD(''); }
    function next() { const index = filtered.findIndex(e => e.id === current?.id); selectExercise(filtered[style === 'article' ? Math.min(index + 1, filtered.length - 1) : (index + 1) % filtered.length]?.id || ''); }
    async function grade() {
        flushDraft(key);
        await draftQueue;
        const attempt = await api('/grade', { exerciseId: current.id, answer, mode: listening && mode === 'english' ? 'dictation' : 'auto', practiceType: kind, answerMode: listening ? mode : 'chinese' });
        RS(previous => ({ ...previous, [key]: { result: attempt.result, mode: attempt.mode, answer } }));
        setFeedbackTab('overview'); setFeedbackKey(key);
        clearTimeout(pendingDrafts.current.get(key)?.timer);
        pendingDrafts.current.delete(key);
        persistDraft(key, answer);
        await refresh();
    }
    async function showHint() {
        if (current.keywords?.length) { HT(current.keywords.slice(0, 3).map(k => ({ word: k.english, meanings: k.translations }))); return; }
        const data = await api('/dictionary/batch', { text: current.text });
        HT(data.entries.filter(e => e.meanings?.length).slice(0, 3));
    }
    return <div className="exercise-layout practice-layout">
        <section className="panel practice-panel">
            <div className="section-head"><h2>{listening ? '听力练习' : '英译中练习'}</h2><span className="quiet">{filtered.length ? `第 ${filtered.indexOf(current) + 1} ${style === 'article' ? '句' : '题'} / 共 ${filtered.length} ${style === 'article' ? '句' : '题'}` : '暂无题目'}</span></div>
            <div className="practice-modes" role="group" aria-label="练习模式"><button className={style === 'single' ? 'selected' : ''} aria-pressed={style === 'single'} onClick={() => { setStyle('single'); selectExercise(singleId.current); }}>单句练习</button><button className={style === 'article' ? 'selected' : ''} aria-pressed={style === 'article'} onClick={() => { setStyle('article'); selectExercise(positions.current[activeArticle] || ''); }}>整篇逐句练习</button></div>
            {style === 'article' ? <div className="article-options"><label>选择文章<select aria-label="选择文章" value={activeArticle} onChange={e => { setArticleId(e.target.value); selectExercise(positions.current[e.target.value] || ''); }}>{articles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>{current?.licenseUrl && <p className="news-credit">来源：{current.source} · 作者：{current.author} · <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer">查看原文</a> · 文字许可：<a href={current.licenseUrl} target="_blank" rel="noopener noreferrer">{current.license}</a>{current.changes && <> · {current.changes}</>}</p>}<p className="quiet">按文章顺序逐句练习，句子与听力进度分别保存。部分材料提供中文参考和评分关键词；没有关键词时可配置 AI 评分或自行设置。</p><details className="practice-options"><summary>从书架创建文章练习</summary><p className="quiet">选择书架中的短篇文本创建练习。每篇不超过 5 万字符；长篇小说可先将章节粘贴导入书架，EPUB 请先转为文本。生成的听力为系统朗读。</p><label>选择文本<select aria-label="选择书架文本" value={bookChoice} onChange={e => setBookChoice(e.target.value)}><option value="">请选择</option>{books.filter(b => !b.hiddenSample && b.format !== 'epub' && b.text).map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label><button disabled={busy || !bookChoice} onClick={() => run(async () => { const added = await api('/article-practice', {bookId:bookChoice}); await refresh(); setArticleId(added.articleId); selectExercise(positions.current[added.articleId] || ''); })}>创建逐句练习</button></details></div> : <details className="practice-options"><summary>选择题目与来源</summary>
                <div className="filter-row">
                    <label>难度<select value={level} onChange={e => { LV(e.target.value); SH(false); HT(null); }}><option value="all">全部难度</option><option value="beginner">初级</option><option value="intermediate">中级</option><option value="advanced">高级</option></select></label>
                    <label>主题<select value={topic} onChange={e => { TP(e.target.value); SH(false); HT(null); }}><option value="all">全部主题</option>{[...new Set(exercises.map(e => e.topic).filter(Boolean))].map(t => <option key={t}>{t}</option>)}</select></label>
                    <label>来源<select value={source} onChange={e => { SO(e.target.value); SH(false); HT(null); }}><option value="all">全部来源</option><option value="builtin">内置与个人素材</option><option value="reading">阅读中收藏</option><option value="online">在线例句</option><option value="audio">真人录音</option></select></label>
                </div>
                {current && <label>选择练习<select aria-label="选择练习" value={current.id} onChange={e => selectExercise(e.target.value)}>{filtered.map((e, i) => <option key={e.id} value={e.id}>{listening ? `练习 ${i + 1} · ${e.topic || e.source || '个人素材'}` : `${i + 1}. ${e.text}`}</option>)}</select></label>}
                <p className="quiet">难度为素材的粗略分级，并非标准考试等级。</p>
            </details>}
            {current ? <>
                {listening ? <>
                    <div className="practice-modes" role="group" aria-label="听力练习方式"><button className={mode === 'english' ? 'selected' : ''} aria-pressed={mode === 'english'} onClick={() => { MD('english'); HT(null); }}>听英文写英文</button><button className={mode === 'chinese' ? 'selected' : ''} aria-pressed={mode === 'chinese'} onClick={() => { MD('chinese'); HT(null); }}>听英文写中文意思</button></div>
                    <div className="listen-player"><p>{current.audioUrl ? '真人录音' : '系统合成语音 · 非真人录音'}</p>{current.audioUrl && <audio key={current.id} ref={audioRef} src={current.audioUrl} controls preload="metadata" onLoadedMetadata={e => { e.currentTarget.playbackRate = rate; }} onError={() => setAudioError('录音无法播放，请换一道题重试。')} aria-label="真人录音播放器"/>}<div className="actions">{current.audioUrl ? <button className="primary" onClick={() => { audioRef.current.currentTime = 0; audioRef.current.play().catch(() => setAudioError('录音无法播放，请检查系统声音后重试。')); }}>从头重播</button> : <><button className="primary" onClick={() => speak(current.text, rate)}>播放 / 重播</button><button onClick={() => window.speechSynthesis?.pause()}>暂停</button><button onClick={() => window.speechSynthesis?.resume()}>继续</button></>}<label>语速<select aria-label="朗读速度" value={rate} onChange={e => { const speed = +e.target.value; RT(speed); if (audioRef.current) audioRef.current.playbackRate = speed; }}><option value="0.7">慢速 0.7×</option><option value="1">正常 1×</option><option value="1.2">快速 1.2×</option></select></label></div>{current.audioUrl ? <p className="quiet">{current.attribution} · {current.license} {current.sourceUrl && <a href={current.sourceUrl} target="_blank" rel="noreferrer">查看录音来源</a>}</p> : <p className="quiet">调整语速后点击重播生效。</p>}{audioError && <p role="alert">{audioError}</p>}</div>
                    <button className="text-button" onClick={() => SH(!show)}>{show ? '收起英文原文' : '提前查看英文原文'}</button>{show && <p className="practice-prompt">{current.text}</p>}
                </> : <p className="practice-prompt">{current.text}</p>}
                <p className="quiet">来源：{current.source || '个人素材'} · {current.topic || '未分类'} {current.sourceUrl && <a href={current.sourceUrl} target="_blank" rel="noreferrer">查看来源与授权</a>}</p>
                <label>{listening && mode === 'english' ? '写下听到的英文' : '写下你理解的中文意思'}<textarea ref={answerInput} rows={2} disabled={!draftReady || busy} value={answer} onChange={e => updateDraft(key, e.target.value)} onBlur={() => flushDraft(key)} placeholder={listening && mode === 'english' ? '在这里输入英文……' : '在这里输入中文意思……'}/></label>
                <div className="actions"><button className="primary" disabled={busy || !answer.trim()} onClick={() => run(grade)}>{busy ? '评分中…' : saved ? '重新提交' : '提交答案'}</button><button disabled={busy} onClick={() => run(showHint)}>关键词提示</button><button disabled={busy || !answer} onClick={() => { updateDraft(key, ''); flushDraft(key); RS(previous => ({ ...previous, [key]: null })); }}>清空答案</button>{style === 'article' && <button disabled={filtered.indexOf(current) <= 0} onClick={() => selectExercise(filtered[filtered.indexOf(current)-1].id)}>上一句</button>}<button disabled={style === 'article' && filtered.indexOf(current) === filtered.length - 1} onClick={next}>{style === 'article' ? '跳过 / 下一句' : '跳过 / 下一题'}</button>{current.bookId && (!books || books.some(book => book.id === current.bookId)) && <button onClick={() => onBook(current)}>返回原文</button>}</div>{current.bookId && books && !books.some(book => book.id === current.bookId) && <p className="quiet">原书已删除，暂无法返回原文。</p>}
                {draftError && <p role="alert" className="draft-error">{draftError}</p>}
                {hint && <div className="practice-hint"><b>关键词提示</b><p>{hint.length ? hint.map(h => `${h.word || h.original}：${h.meanings.join(' / ')}`).join('；') : '本地词典暂未找到可用提示。'}</p><p className="quiet">词义仅供参考，具体意思取决于语境。</p></div>}
                {result && <div className="feedback-summary" aria-live="polite"><span>{result.score != null ? `本次参考分数：${result.score} 分` : '本次反馈：自行对照'}{answer !== saved.answer && ' · 对应上次提交的答案'}</span><button ref={feedbackOpener} onClick={() => { setFeedbackTab('overview'); setFeedbackKey(key); }}>查看反馈</button></div>}
                {feedbackVisible && <dialog ref={feedbackDialog} className="feedback-dialog" aria-labelledby={kind + '-feedback-title'} onCancel={event => { event.preventDefault(); closeFeedback(); }} onClose={() => setFeedbackKey(null)}>
                    <header className="feedback-dialog-header"><div><h3 id={kind + '-feedback-title'}>本次反馈</h3><p>{result.score != null ? `参考分数 ${result.score} 分` : '自行对照'} · {saved.mode === 'ai' ? 'AI 语义评价' : saved.mode === 'dictation' ? '英文单词对照' : '基础关键词比对'}</p></div><button autoFocus aria-label="收起反馈" onClick={() => closeFeedback()}>收起</button></header>
                    <div className="feedback-dialog-tabs" role="group" aria-label="反馈内容">
                        {[['overview','评分概览'],['comparison','原文对照'],['words',`生词建议 · ${candidates.length}`]].map(([value,label]) => <button key={value} className={feedbackTab === value ? 'selected' : ''} aria-pressed={feedbackTab === value} onClick={() => setFeedbackTab(value)}>{label}</button>)}
                    </div>
                    <div className="feedback-dialog-body feedback">
                        {answer !== saved.answer && <p className="quiet">这份反馈对应上次提交的答案，当前答案已修改。</p>}
                        {feedbackTab === 'overview' && <>
                            {result.notice && <p>{result.notice}</p>}
                            {!!result.strengths?.length && <section><h4>表达得好的地方</h4><p>{result.strengths.join('；')}</p></section>}
                            {!!result.issues?.length && <section><h4>值得再检查</h4><p>{result.issues.join('；')}</p></section>}
                            {(result.feedback || result.explanation) && <p>{result.feedback || result.explanation}</p>}
                            {!result.notice && !result.strengths?.length && !result.issues?.length && !result.feedback && !result.explanation && <p>请在原文对照中查看本次答案。</p>}
                        </>}
                        {feedbackTab === 'comparison' && <>
                            <div className="answer-comparison"><div><b>英文原文</b><p>{current.text}</p></div><div><b>你提交的答案</b><p>{saved.answer}</p></div><div><b>中文参考译文</b><p>{result.reference || current.reference || '此题暂未提供参考译文。'}</p></div></div>
                            {!result.reference && !current.reference && <div><button disabled={busy} onClick={() => run(async () => { const text = current.text, id = current.id; setAssistance({ id, ...(await api('/translate', { text })) }); })}>查看辅助翻译</button><p className="quiet">使用现有查译服务，结果仅供对照，不作为评分依据。</p>{assistance?.id === current.id && <><p className="quiet">{assistance.provider === 'dictionary' ? '本地词典逐词释义，并非完整句译。' : '机器译文，仅供参考。'}</p><p style={{whiteSpace:'pre-line'}}>{assistance.translation}</p></>}</div>}
                            {result.diff && <><b>听写对照</b><p className="quiet">绿色：一致；下划线：原文中有、答案中缺少；删除线：答案中多出。词语不同可能同时显示为缺少和多出。</p><p>{result.diff.map((d, i) => <span key={i} className={'token-' + d.status}>{d.token} </span>)}</p></>}
                        </>}
                        {feedbackTab === 'words' && <><p className="quiet">请选择需要收录的词语，确认后加入生词本。</p>{!candidates.length && <p>本次没有建议积累的词语。</p>}{candidates.map(w => <div className="row" key={w.word || w.english}><span>{w.word || w.english} · {w.meaning || w.translations?.join('；') || '暂无释义'}</span><button disabled={busy || words.some(x => x.word.toLowerCase() === (w.word || w.english).toLowerCase())} onClick={() => run(async () => { await api('/words', { word: w.word || w.english, meaning: w.meaning || w.translations?.join('；') || '', context: current.text, bookId: current.bookId, location: current.location }); await refresh(); })}>{words.some(x => x.word.toLowerCase() === (w.word || w.english).toLowerCase()) ? '已在生词本' : '确认加入生词本'}</button></div>)}</>}
                    </div>
                    <footer className="feedback-dialog-footer"><button onClick={() => closeFeedback(true)}>修改答案</button><button onClick={() => closeFeedback()}>收起反馈</button><button className="primary" disabled={style === 'article' && filtered.indexOf(current) === filtered.length - 1} onClick={next}>{style === 'article' ? '下一句' : '下一题'}</button></footer>
                </dialog>}
                <details key={current.id} className="practice-options"><summary>提前查看参考译文与评分设置</summary><p>{current.reference || '此题暂未提供参考译文。'}</p><p className="quiet">中文答案可使用已配置的 AI 语义评分；未配置或不可用时，按预设关键词提供有限的基础反馈。没有关键词时不提供分数。</p><button onClick={() => { if (!editing) KD((current.keywords || []).map(k => k.english + '=' + k.translations.join('/')).join('\n')); ED(!editing); }}>{editing ? '收起关键词编辑' : '编辑中文评分关键词'}</button>{editing && <><label>每行：英文=中文 / 同义词<textarea value={keywordDraft} onChange={e => KD(e.target.value)} placeholder="read=阅读/读书"/></label><button disabled={busy} onClick={() => run(async () => { await api('/exercises/' + current.id, { keywords: keywordDraft.split('\n').filter(Boolean).map(line => { const [english, translation = ''] = line.split('='); return { english: english.trim(), translations: translation.split('/').map(t => t.trim()).filter(Boolean) }; }) }, 'PATCH'); await refresh(); ED(false); })}>保存关键词</button></>}</details>
            </> : <p className="quiet">此筛选下暂无练习，请调整筛选或从阅读中添加。</p>}
            <details className="practice-options catalog-search"><summary>在线搜索例句</summary><p className="quiet">搜索社区双语例句。加入后可练习；中文评分需要预设关键词或启用 AI 评分。</p><form className="search" onSubmit={e => { e.preventDefault(); run(async () => { OR((await api('/exercise-catalog?q=' + encodeURIComponent(onlineQuery))).results || []); SQ(true); }); }}><input aria-label="在线例句搜索" value={onlineQuery} onChange={e => OQ(e.target.value)} placeholder="输入英文关键词"/><button disabled={busy || !onlineQuery.trim()}>搜索例句</button></form>{searched && !onlineResults.length && <p className="quiet">没有找到例句，请尝试其他英文关键词。</p>}{onlineResults.map(e => <div className="row" key={e.id}><div><p>{e.text}</p><details><summary>查看中文译文</summary><p>{e.reference}</p></details><small>{e.source} · {e.license} · {typeof e.attribution === 'string' ? e.attribution : ['english', 'chinese'].map(lang => { const credit = e.attribution?.[lang]; return credit ? (lang === 'english' ? '英文' : '中文') + '：' + (typeof credit.author === 'object' ? (credit.author?.name || credit.author?.username || '匿名') : credit.author || '匿名') + ' · ' + (credit.license || e.license || '') : ''; }).filter(Boolean).join('；')}</small>{e.sourceUrl && <p><a href={e.sourceUrl} target="_blank" rel="noreferrer">查看原始来源</a></p>}</div><button disabled={busy} onClick={() => run(async () => { const added = await api('/exercise-catalog/import', { id: e.id }); await refresh(); setStyle('single'); LV('all'); TP('all'); SO('all'); selectExercise(added.id); })}>加入练习</button></div>)}</details>
        </section>
        <details className="panel practice-history"><summary><span>{listening ? '听力' : '句子'}练习记录</span><small> · {history.length} 次</small></summary><p className="quiet">选择记录可再次练习。</p><label>筛选记录<select aria-label="筛选练习记录" value={historyFilter} onChange={e => { setHistoryFilter(e.target.value); setHistoryLimit(8); }}><option value="all">全部记录</option><option value="review">需要再练</option><option value="reading">阅读中收藏</option></select></label>{historyFilter === 'review' && <p className="quiet">包含低于 80 分或反馈有待检查项的记录，不代表其他答案一定正确。</p>}{!visibleHistory.length && <p className="quiet">{history.length ? '没有符合条件的记录。' : '提交第一道题后，记录会显示在这里。'}</p>}{visibleHistory.slice(0, historyLimit).map(a => { const exercise = exerciseById.get(a.exerciseId); return <div className="row" key={a.id}><div><p>{exercise ? (listening ? '听力练习 · ' + new Date(a.createdAt).toLocaleDateString('zh-CN') : exercise.text) : '原题已不可用'}</p><small>{a.answerMode === 'english' ? '英文听写' : '中文理解'} · {a.result?.score != null ? a.result.score + ' 分' : '无分数'}</small></div><button disabled={!exercise} onClick={() => { if (exercise.articleId) { setStyle('article'); setArticleId(exercise.articleId); } else setStyle('single'); LV('all'); TP('all'); SO('all'); selectExercise(a.exerciseId); const historyKey = a.exerciseId + ':' + (listening ? a.answerMode : 'chinese'); DS(previous => ({ ...previous, [historyKey]: previous[historyKey] ?? a.answer })); RS(previous => ({ ...previous, [historyKey]: { result: a.result, mode: a.mode, answer: a.answer } })); if (listening) MD(a.answerMode || 'english'); setFeedbackTab('overview'); setFeedbackKey(historyKey); }}>查看 / 再练</button></div>; })}{historyLimit < visibleHistory.length && <button onClick={() => setHistoryLimit(n => n + 8)}>查看更多记录</button>}</details>
    </div>;
}
