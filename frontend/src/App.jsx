import MediaPreview from './MediaPreview.jsx';
import PracticePanel from './PracticePanel.jsx';
import VocabularyPanel from './VocabularyPanel.jsx';
import NewsPanel from './NewsPanel.jsx';
import ApiSettings from './ApiSettings.jsx';
import React, { useState, useEffect, useRef } from 'react';
import { Home, BookOpen, Languages, Headphones, Library, Newspaper, Clapperboard, Settings, ArrowUpRight, Plus, Search, Volume2, X, ArrowLeft, Trash2 } from 'lucide-react';
const nav = [['首页', Home], ['单词', Languages], ['句子练习', BookOpen], ['听力', Headphones], ['书架', Library], ['新闻', Newspaper], ['影视', Clapperboard], ['设置', Settings]];
async function api(path, body, method, signal) {
    const r = await fetch('/api' + path, { signal, method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json();
    if (!r.ok)
        throw Error(d.error || '请求失败');
    return d;
}
export default function App() {
    const [page, P] = useState('首页'), [data, D] = useState({ books: [], words: [], exercises: [], attempts: [], settings: {} }), [error, E] = useState(''), [busy, B] = useState(false), [modal, M] = useState(''), [book, SB] = useState(null), [selection, S] = useState(''), [lookup, L] = useState(null), [exercise, EX] = useState(null), [query, Q] = useState(''), [results, RS] = useState([]), [targets,TARGETS]=useState({sentence:'',listening:''});
    const [homeLookup, setHomeLookup] = useState(null);
    const [vocabTarget,VT]=useState(null), [vocabRound,setVocabRound]=useState({book:'',state:'',words:[]});const reader = useRef();
    const pageTurnTimer = useRef(), hadSelection = useRef(false);
    const [jump, JUMP] = useState(0), [readingPreview, RP] = useState(null), [selectedLocation, SL] = useState(null);
    const epubView = useRef();
    const [textPage, setTextPage] = useState(0), [showBookmarks, setShowBookmarks] = useState(false), [showReaderSettings, setShowReaderSettings] = useState(false), [showToc, setShowToc] = useState(false), [toc, setToc] = useState([]), [currentChapter, setCurrentChapter] = useState('');
    const [textPages, setTextPages] = useState([]), [paginationDone, setPaginationDone] = useState(false), [readerSize, setReaderSize] = useState(0);
    const [bookSearched, setBookSearched] = useState(false), [bookWarning, setBookWarning] = useState(''), [bookSearchPending, setBookSearchPending] = useState(false), [bookOrder, setBookOrder] = useState('recent'), [backup, setBackup] = useState(null), [manualWord, setManualWord] = useState(false);
    const saveQueue = useRef(Promise.resolve());
    useEffect(() => {
        if (page !== '阅读' || !reader.current || book?.format === 'epub') return;
        const observer = new ResizeObserver(() => setReaderSize(n => n + 1));
        observer.observe(reader.current);
        return () => observer.disconnect();
    }, [page, book?.id]);
    useEffect(() => {
        if (page !== '阅读' || !book || book.format === 'epub' || !reader.current) return;
        const text = book.text || '', element = reader.current, rect = element.getBoundingClientRect();
        const measure = document.createElement('article');
        measure.className = element.className;
        Object.assign(measure.style, { position: 'fixed', left: '-10000px', top: '0', width: rect.width + 'px', height: rect.height + 'px', visibility: 'hidden', fontSize: (data.settings.fontSize || 19) + 'px', lineHeight: data.settings.lineHeight || 1.9 });
        document.body.appendChild(measure);
        let start = 0, frame;
        const pages = [];
        setPaginationDone(false); setTextPages([]);
        function fits(end) {
            measure.replaceChildren(...text.slice(start, end).split('\n').map(line => { const p = document.createElement('p'); p.textContent = line || '\u00a0'; return p; }));
            return measure.scrollHeight <= measure.clientHeight + 1;
        }
        function paginate() {
            for (let count = 0; count < 8 && start < text.length; count++) {
                let low = start + 1, high = Math.min(text.length, start + 10000), end = low;
                while (low <= high) { const mid = Math.floor((low + high) / 2); if (fits(mid)) { end = mid; low = mid + 1; } else high = mid - 1; }
                if (end < text.length) { const boundary = Math.max(text.lastIndexOf(' ', end - 1), text.lastIndexOf('\n', end - 1)); if (boundary > start) end = boundary + 1; }
                pages.push({ start, end, text: text.slice(start, end) }); start = end;
            }
            if (!pages.length) pages.push({ start: 0, end: 0, text: '' });
            setTextPages([...pages]);
            if (start < text.length) frame = requestAnimationFrame(paginate); else { setPaginationDone(true); measure.remove(); }
        }
        frame = requestAnimationFrame(paginate);
        return () => { cancelAnimationFrame(frame); measure.remove(); };
    }, [page, book?.id, book?.text, readerSize, data.settings.fontSize, data.settings.lineHeight, data.settings.readingTheme]);
    function saveBook(changes) {
        const id = book.id;
        SB(previous => previous?.id === id ? { ...previous, ...changes } : previous);
        D(previous => ({ ...previous, books: previous.books.map(item => item.id === id ? { ...item, ...changes, lastReadAt: new Date().toISOString() } : item) }));
        saveQueue.current = saveQueue.current.then(() => api('/books/' + id, changes, 'PATCH')).catch(error => E('保存阅读进度失败：' + error.message));
    }
    function openTextPage(index) {
        if (!textPages.length) return;
        const next = Math.max(0, Math.min(index, textPages.length - 1));
        setTextPage(next); reader.current?.scrollTo(0, 0);
        S(''); L(null); SL(null);
        saveBook({ location: 't:' + textPages[next].start, progress: paginationDone && next === textPages.length - 1 ? 1 : textPages[next].start / Math.max(1, book.text.length) });
    }
    function rememberReaderSelection() {
        clearTimeout(pageTurnTimer.current);
        hadSelection.current = !!(document.getSelection()?.toString().trim() || epubView.current?.renderer?.getContents()?.some(({ doc }) => doc?.getSelection()?.toString().trim()));
    }
    function turnReaderByClick(event, epub = false) {
        clearTimeout(pageTurnTimer.current);
        const doc = event.currentTarget.nodeType === 9 ? event.currentTarget : document;
        if (event.button !== 0 || event.detail > 1 || event.target.closest('a, button, input, select, textarea, [contenteditable]') || doc.getSelection()?.toString().trim()) return;
        if (hadSelection.current) {
            document.getSelection()?.removeAllRanges();
            epubView.current?.renderer?.getContents()?.forEach(({ doc }) => doc?.getSelection()?.removeAllRanges());
            hadSelection.current = false;
            S(''); L(null); SL(null);
            return;
        }
        const rect = reader.current.getBoundingClientRect();
        const x = event.clientX + (doc === document ? 0 : doc.defaultView.frameElement.getBoundingClientRect().left);
        const direction = x < rect.left + rect.width / 2 ? -1 : 1;
        pageTurnTimer.current = setTimeout(() => {
            if (doc.getSelection()?.toString().trim()) return;
            if (epub) {
                S(''); L(null); SL(null);
                if (direction < 0) epubView.current?.prev(); else epubView.current?.next();
            } else openTextPage(textPage + direction);
        }, 250);
    }
    useEffect(() => () => clearTimeout(pageTurnTimer.current), [page, book?.id]);
    useEffect(() => {
        if (page !== '阅读' || !selection) return;
        const dismiss = event => {
            if (event.target.closest('.selection-panel, .overlay') || reader.current?.contains(event.target)) return;
            document.getSelection()?.removeAllRanges();
            epubView.current?.renderer?.getContents()?.forEach(({ doc }) => doc?.getSelection()?.removeAllRanges());
            S(''); L(null); SL(null); hadSelection.current = false;
        };
        document.addEventListener('mouseup', dismiss);
        return () => document.removeEventListener('mouseup', dismiss);
    }, [page, selection]);
    function addBookmark() {
        const location = book.format === 'epub' ? book.location : 't:' + textPages[textPage].start;
        if (typeof location !== 'string' || !location) { E('请先打开正文再添加书签'); return; }
        const marks = book.bookmarks || [];
        if (marks.some(mark => mark.location === location)) return;
        saveBook({ bookmarks: [...marks, { id: crypto.randomUUID(), location, progress: book.progress || 0, label: selection.slice(0, 60) || (book.format === 'epub' ? '阅读位置 ' + Math.round((book.progress || 0) * 100) + '%' : '第 ' + (textPage + 1) + ' 页'), createdAt: new Date().toISOString() }] });
        setShowBookmarks(true);
    }
    function goBookmark(mark) {
        if (book.format === 'epub') openBook({ ...book, location: mark.location });
        else { const offset = Number(String(mark.location).slice(2)) || 0; openTextPage(Math.max(0, textPages.findLastIndex(page => page.start <= offset))); }
    }

    function epubStyles() { const theme = data.settings.readingTheme; return `html,body{font-size:${data.settings.fontSize || 19}px!important;line-height:${data.settings.lineHeight || 1.8}!important;background:${theme === 'dark' ? '#242823' : theme === 'sepia' ? '#f3ebd9' : '#fff'}!important;color:${theme === 'dark' ? '#dae0d6' : '#263c33'}!important}p{line-height:inherit!important}`; }
    ;
    useEffect(() => { epubView.current?.renderer?.setStyles?.(epubStyles()); }, [data.settings.fontSize, data.settings.lineHeight, data.settings.readingTheme]);
    useEffect(() => { RP(null); if (page === '阅读' && book?.text)
        api('/reading/preview', { text: book.text }).then(RP).catch(e => E(e.message)); }, [page, book?.id]);
    const [mediaSearched, setMediaSearched] = useState(false), [mediaWarning, setMediaWarning] = useState(''), [tryUnknown, setTryUnknown] = useState(false), [mediaResultsOpen, setMediaResultsOpen] = useState(true), [mediaSearchOpen,setMediaSearchOpen]=useState(true);
    const [rate, SR] = useState(1), [media, SM] = useState(null), [playing, SP] = useState(false), [episode, SE] = useState(0), [context, SC] = useState(''), [mediaSource, MS] = useState('cms'), [mediaFilters, MF] = useState({ type: 'all', country: 'all', language: '英语' }), [categories, CT] = useState({ types: [], countries: [], languages: [] });
    const refresh = () => api('/bootstrap').then(D).catch(e => E(e.message));
    useEffect(() => { refresh(); api('/media/categories').then(CT).catch(e => E(e.message)); }, []);
    useEffect(() => window.electronNews?.onPractice?.(({ exerciseId, kind }) => {
        refresh();
        TARGETS(previous => ({ ...previous, [kind]: { exerciseId, token: Date.now() } }));
        P(kind === 'listening' ? '听力' : '句子练习');
    }), []);
    async function run(fn) {
        B(true);
        E('');
        try {
            await fn();
        }
        catch (e) {
            E(e.message);
        }
        finally {
            B(false);
        }
    }
    function speak(text, speed) {
        if (!window.speechSynthesis) {
            E('当前环境不支持语音朗读');
            return;
        }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = speed || rate;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
    }
    function openBook(b) { setTextPage(0); JUMP(n => n + 1); setShowBookmarks(false); setShowReaderSettings(false); setShowToc(false); setToc([]); setCurrentChapter(''); SL(null); SB(b); P('阅读'); S(''); L(null); D(previous => ({...previous,books:previous.books.map(item=>item.id===b.id?{...item,lastReadAt:new Date().toISOString()}:item)})); saveQueue.current=saveQueue.current.then(()=>api('/books/'+b.id,{},'PATCH')).catch(error=>E('保存阅读记录失败：'+error.message)); }
    useEffect(() => {
        if (page !== '阅读' || !book || book.format === 'epub') return;
        const location = String(book.location || '');
        let offset = 0;
        if (location.startsWith('t:')) offset = Number(location.slice(2)) || 0;
        else if (location.startsWith('p:')) offset = (book.text || '').split('\n').slice(0, Number(location.slice(2)) || 0).reduce((n, line) => n + line.length + 1, 0);
        else if (Number(location) > 0) offset = Math.floor((book.progress || 0) * (book.text || '').length);
        if (textPages.length && (paginationDone || textPages[textPages.length - 1].end > offset)) setTextPage(Math.max(0, textPages.findLastIndex(part => part.start <= offset)));
        else setTextPage(0);
    }, [page, book?.id, jump, textPages, paginationDone]);
    async function addCandidate(w) {
        if (words.some(x => x.word.toLowerCase() === (w.word || w.english).toLowerCase()))
            return;
        await api('/words', { word: w.word || w.english, meaning: w.meaning || w.translations?.join('；') || '', context:w.context||'',source:[media?.title,media?.type==='tv'&&(media.episodes?.[episode]?.label||media.episodes?.[episode]?.title)].filter(Boolean).join(' · ')||'影视字幕' });
        await refresh();
    }
    useEffect(() => {
        if (page !== '阅读' || !book || book.format !== 'epub')
            return;
        let view;
        run(async () => { await import(/* @vite-ignore */ new URL('/vendor/foliate-js/view.js', window.location.origin).href); view = document.createElement('foliate-view'); epubView.current = view; reader.current.replaceChildren(view); await view.open(new File([await (await fetch('/api/books/' + book.id + '/file')).blob()], book.title + '.epub', { type: 'application/epub+zip' })); setToc(view.book.toc || []); view.addEventListener('load', e => {api('/reading/preview',{text:e.detail.doc.body.textContent}).then(RP).catch(err=>E(err.message));e.detail.doc.addEventListener('mouseup', () => { const sel = e.detail.doc.getSelection(); S(sel?.toString().trim() || ''); L(null); SC(sel?.anchorNode?.parentElement?.closest('p')?.textContent || sel?.toString() || ''); }); e.detail.doc.addEventListener('mousedown', rememberReaderSelection); e.detail.doc.addEventListener('click', event => turnReaderByClick(event, true));}); view.addEventListener('relocate', e => { setCurrentChapter(e.detail.tocItem?.label || ''); saveBook({ progress: e.detail.fraction, location: e.detail.cfi }); }); view.renderer.setAttribute('margin', '24px'); view.renderer.setStyles?.(epubStyles()); await view.init({ lastLocation: book.location || undefined, showTextStart: true }); });
        return () => view?.close?.();
    }, [book?.id, page, jump]);
    const words = data.words || [], books = [...(data.books || [])].sort((a, b) => (b.lastReadAt || '').localeCompare(a.lastReadAt || '')), exercises = data.exercises || [], attempts = data.attempts || [];
    const visibleBooks = books.filter(book => !book.hiddenSample);
    const shelfBooks = bookOrder === 'title' ? [...visibleBooks].sort((a, b) => a.title.localeCompare(b.title, 'en')) : visibleBooks;
    const homeBook = visibleBooks.find(book => book.lastReadAt || book.progress > 0) || visibleBooks[0];
    const hasReadingHistory = !!(homeBook?.lastReadAt || homeBook?.progress > 0);
    const current = exercise || exercises[0];
    const tocItems = items => <ul className="reader-toc-list">{items.map((item, i) => <li key={item.href || i}>{item.href ? <button className={currentChapter === item.label ? 'selected' : ''} onClick={() => { epubView.current?.goTo(item.href); setShowToc(false); }}>{item.label || '未命名章节'}</button> : <b>{item.label || '未命名章节'}</b>}{item.subitems?.length > 0 && tocItems(item.subitems)}</li>)}</ul>;
    async function submitForm(e, path, extra = {}) { e.preventDefault(); const fd = new FormData(e.target); const form = Object.fromEntries(fd); if (path === '/settings')
        form.apiUses = fd.getAll('apiUses'); await run(async () => { await api(path, { ...form, ...extra }, path === '/settings' ? 'PUT' : undefined); M(''); await refresh(); }); }
    const empty = (title, desc, action) => <div className="empty"><BookOpen size={32}/><h3>{title}</h3><p>{desc}</p>{action}</div>;
    return <div className="app"><aside><a className="brand" onClick={() => P('首页')}><BookOpen size={29}/><span>拾句<small>英语学习助手</small></span></a><div className="workspace">个人学习空间 <span>本地</span></div><nav>{nav.map(([name, Icon]) => <button key={name} className={page === name ? 'active' : ''} onClick={() => { const reading = page === '阅读'; P(name); Q(''); setHomeLookup(null); RS([]); setBookSearched(false); if (reading) saveQueue.current.then(refresh); else refresh(); }}><Icon size={18}/>{name}{name === '单词' && <small>{words.length}</small>}</button>)}</nav><div className="aside-bottom"><span className="dot"/> 学习数据保存在本机<p>从一句话开始，慢慢读懂世界。</p></div></aside><main className={page === '阅读' ? 'reader-main' : undefined}><header><span>{page === '阅读' ? '书架 / ' + book?.title : '学习空间 / ' + page}</span><span>{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span></header>{error && <div role="alert" className="error">{error}<button onClick={() => E('')}>关闭</button></div>}<div className={'content' + (page === '阅读' ? ' reading-content' : '') + (['句子练习','听力'].includes(page) ? ' practice-content' : '')}><div className="title"><div><h1>{page === '首页' ? '把英语，读进生活里。' : page === '阅读' ? book?.title : page}</h1><p>{page === '首页' ? '阅读、积累、练习。让每一次遇见，都成为自己的表达。' : ({ 单词: '在语境里积累，在回忆中掌握。', 句子练习: '从读懂一句话，到理解细微的语义。', 听力: '听清每一个词，理解每一句话。', 书架: '收藏你想读的世界。', 新闻: '读新闻，在真实语境中练习英语。', 影视: '在真实对白中，听见鲜活的英语。', 设置: '让学习空间适合你的习惯。' })[page]}</p></div>{page === '书架' && <button className="primary" onClick={() => M('导入书籍')}><Plus size={16}/>导入书籍</button>}{page === '单词' && <button className="primary" onClick={() => { setManualWord(true); M('添加单词'); }}><Plus size={16}/>添加单词</button>}</div>
    {page === '首页' && <><div className="home-start"><section className="panel reading"><div className="section-head"><h2>{hasReadingHistory ? '继续阅读' : '开始阅读'}</h2><button onClick={() => P('书架')}>全部书籍 <ArrowUpRight size={16}/></button></div>{visibleBooks.length ? <div className="continue"><div className="cover">{homeBook.title}<small>{homeBook.author || '我的阅读'}</small></div><div><span className="muted">{hasReadingHistory ? '上次读到' : '挑一本书开始'}</span><h2>{homeBook.title}</h2><p>{homeBook.author || '个人书籍'}</p><progress value={homeBook.progress || 0} max="1"/><p>阅读进度 {Math.round((homeBook.progress || 0) * 100)}%</p><button className="primary" onClick={() => openBook(homeBook)}>{hasReadingHistory ? '继续阅读' : '开始阅读'} <ArrowUpRight size={16}/></button></div></div> : empty('第一本书，等你翻开', '导入 TXT / EPUB，或在线寻找一本英文名著。', <button className="primary" onClick={() => { P('书架'); M('导入书籍'); }}>添加第一本书 <Plus size={16}/></button>)}</section><section className="panel"><div className="section-head"><h2>今日复习 · {data.stats?.dueWords||0} 词</h2><button onClick={()=>{VT({book:data.stats?.dueWords ? "learned" : "cet4",state:data.stats?.dueWords ? "review" : "new",token:Date.now()});P("单词")}}>{data.stats?.dueWords ? "开始复习" : "学习新词"}</button></div>{!data.stats?.dueWords && <p className="quiet">今天暂无待复习单词。</p>}<h3>最近练习</h3>{attempts.slice(-3).reverse().map(a=><div className="row" key={a.id}><span>{a.practiceType==="listening"?"听力":"句子"} · {a.result?.score??"—"} 分 · {a.answer}</span><button onClick={()=>{const kind=a.practiceType||"sentence";TARGETS(t=>({...t,[kind]:{exerciseId:a.exerciseId,token:Date.now()}}));P(kind==="listening"?"听力":"句子练习")}}>返回练习</button></div>)}{!attempts.length&&<p className="quiet">完成第一道练习后，记录会出现在这里。</p>}</section></div><div className="stats">{[['积累单词', words.length, '词'], ['已掌握', data.stats?.masteredWords||0, '词'], ['完成练习', attempts.length, '次'], ['我的书架', visibleBooks.length, '本']].map(([label, n, unit]) => <div key={label}><span>{label}</span><strong>{n}<small>{unit}</small></strong></div>)}</div><section className="panel"><h2>日常查词与翻译</h2><form className="search" onSubmit={e => { e.preventDefault(); run(async () => { const text = query.trim(); if (/^[a-z]+(?:['’\-][a-z]+)*$/i.test(text)) { const entry = await api('/dictionary?q=' + encodeURIComponent(text)); if (entry.meanings?.length) { setHomeLookup({ ...entry, kind: 'dictionary' }); return; } const translated = await api('/translate', { text }); setHomeLookup({ ...translated, kind: 'fallback' }); } else setHomeLookup({ ...(await api('/translate', { text })), kind: 'sentence' }); }); }}><input aria-label="日常查译文本" value={query} onChange={e => { Q(e.target.value); setHomeLookup(null); }} placeholder="输入英文单词或句子"/><button disabled={busy || !query.trim()}>查询 / 翻译</button></form>{homeLookup && <div aria-live="polite">{homeLookup.kind === 'dictionary' ? <><p>{homeLookup.word} {homeLookup.phonetic && <span>/{homeLookup.phonetic}/</span>}</p>{homeLookup.meanings.map((meaning, i) => <p key={i}>{meaning}</p>)}</> : <>{homeLookup.kind === 'fallback' && <p className="quiet">{homeLookup.provider === 'dictionary' ? '本地词典未收录，在线翻译暂不可用。' : '本地词典未收录，以下机器翻译仅供参考。'}</p>}<p>{homeLookup.translation || '暂未找到释义。'}</p>{homeLookup.provider === 'dictionary' && homeLookup.kind === 'sentence' && <p className="quiet">当前为逐词释义，并非完整句译。</p>}</>}</div>}</section><div className="home-grid"><section className="panel practice"><span className="eyebrow">每日一点，日积月累</span><h2>让遇见的句子，<br />成为你的表达。</h2><p>从一句英文开始，练习理解与表达。<br />关注关键词，也关注自己的进步。</p><button onClick={() => P('句子练习')}>开始句子练习 <ArrowUpRight size={17}/></button></section><section className="panel"><div className="section-head"><h2>最近收录</h2><button onClick={() => P('单词')}>生词本 <ArrowUpRight size={16}/></button></div>{words.length ? words.slice(-4).reverse().map(w => <div className="row" key={w.id}><b>{w.word}</b><span>{w.meaning}</span><button aria-label="朗读" onClick={() => speak(w.word)}><Volume2 size={16}/></button></div>) : <p className="quiet">生词本还是空的。在阅读中选中单词，即可查词并收藏。</p>}</section><section className="panel"><h2>你的学习路径</h2>{[['01', '读一段原文', '从喜欢的书籍或对白开始'], ['02', '留下一点积累', '收藏单词和想学会的句子'], ['03', '试着自己表达', '通过回忆、翻译和听写巩固']].map(([n, t, s]) => <div className="path" key={n}><span>{n}</span><div><b>{t}</b><p>{s}</p></div></div>)}</section></div></>}
    {page === '单词' && <VocabularyPanel books={books} target={vocabTarget} round={vocabRound} setRound={setVocabRound} api={api} run={run} busy={busy} refresh={refresh} speak={speak} words={words} onBook={w => { const b = books.find(b => b.id === w.bookId); if (b)
        openBook({ ...b, location: w.location || 0 }); }}/>}
    {['句子练习', '听力'].map(name => <div key={name} style={{ display: page === name ? 'block' : 'none' }}><PracticePanel books={books} key={name} active={page === name} kind={name === '听力' ? 'listening' : 'sentence'} exercises={exercises} attempts={attempts} initialId={targets[name==='听力'?'listening':'sentence']?.exerciseId} initialArticleId={targets[name==='听力'?'listening':'sentence']?.articleId} jumpToken={targets[name==='听力'?'listening':'sentence']?.token} api={api} refresh={refresh} run={run} busy={busy} speak={speak} words={words} onBook={w => { const b = books.find(b => b.id === w.bookId); if (b)
        openBook({ ...b, location: w.location || 0 }); }}/></div>)}
    {page === '书架' && <><form className="search" onSubmit={e => { e.preventDefault(); setBookSearched(false); setBookWarning(''); setBookSearchPending(true); RS([]); run(async () => { const found=await api('/catalog?q=' + encodeURIComponent(query)); RS(found.results || []); setBookWarning(found.warning || ''); setBookSearched(true); }).finally(() => setBookSearchPending(false)); }}><Search size={18}/><input value={query} onChange={e => { Q(e.target.value); setBookSearched(false); }} placeholder="搜索在线英文名著，书名或作者"/><button disabled={busy || !query.trim()}>{bookSearchPending ? '搜索中…' : '搜索书籍'}</button></form>{bookWarning && <p className="quiet">{bookWarning}</p>}{bookSearched && !results.length && <p className="quiet">没有找到相关书籍，可尝试英文书名或作者。</p>}{results.length > 0 && <section className="panel">{results.map(b => <div className="row" key={b.id}><div><b>{b.title}</b><p>{b.author || b.authors?.map(a => a.name).join(', ')} · {b.source}</p></div><button onClick={() => run(async () => { await api('/catalog/import', { id: b.id, title: b.title, author: b.author }); refresh(); })}>导入书架</button></div>)}</section>}<label className="shelf-sort">书架排序<select value={bookOrder} onChange={e => setBookOrder(e.target.value)}><option value="recent">最近阅读</option><option value="title">按书名</option></select></label><div className="books">{shelfBooks.map(b => <div className="book-entry" key={b.id}><button className="book" onClick={() => openBook(b)}><div className="cover">{b.title}<small>{b.author || '个人书籍'}</small></div><b>{b.title}</b><p>{Math.round((b.progress || 0) * 100)}% 已读 · {b.format?.toUpperCase()}</p></button><button className="book-remove" onClick={() => { if (window.confirm('删除《' + b.title + '》及其阅读进度？相关生词、原句和练习会保留，但不能再返回这本书。')) run(async () => { await api('/books/' + b.id, null, 'DELETE'); await refresh(); }); }}>删除书籍</button></div>)}</div>{!visibleBooks.length && empty('书架留给你喜欢的故事', '支持 TXT、EPUB 和粘贴文本；也可以搜索公共领域名著。')}</>}
    {page === '阅读' && <>
    {book?.licenseUrl && <p className="news-credit">来源：{book.source} · {book.author && <>作者：{book.author} · </>}<a href={book.sourceUrl} target="_blank" rel="noopener noreferrer">查看原文</a>{book.license && <> · 文字许可：<a href={book.licenseUrl} target="_blank" rel="noopener noreferrer">{book.license}</a></>}{book.changes && <> · {book.changes}</>}</p>}
<div className="reader-toolbar"><button onClick={() => P('书架')}><ArrowLeft size={16}/>返回书架</button><button onClick={() => book.format === 'epub' ? epubView.current?.prev() : openTextPage(textPage - 1)} disabled={book.format !== 'epub' && (!textPages.length || textPage === 0)}>上一页</button><button onClick={() => book.format === 'epub' ? epubView.current?.next() : openTextPage(textPage + 1)} disabled={book.format !== 'epub' && (!textPages.length || textPage >= textPages.length - 1)}>下一页</button>{book.format === 'epub' && <button onClick={() => setShowToc(!showToc)}>章节目录</button>}<button onClick={addBookmark} disabled={book.format !== 'epub' && !textPages.length}>添加书签</button><button onClick={() => setShowBookmarks(!showBookmarks)}>书签 · {(book.bookmarks || []).length}</button><button onClick={() => setShowReaderSettings(!showReaderSettings)}>阅读设置</button></div>
    {showReaderSettings && <div className="reader-options"><label>字号 <input type="range" min="14" max="30" value={data.settings.fontSize || 19} onChange={e => D({ ...data, settings: { ...data.settings, fontSize: +e.target.value } })}/></label><label>行距<select value={data.settings.lineHeight || 1.8} onChange={e => D({ ...data, settings: { ...data.settings, lineHeight: +e.target.value } })}><option value="1.5">紧凑</option><option value="1.8">舒适</option><option value="2.2">宽松</option></select></label><label>背景<select onChange={e => D({ ...data, settings: { ...data.settings, readingTheme: e.target.value } })} value={data.settings.readingTheme || 'paper'}><option value="paper">纸白</option><option value="sepia">暖纸</option><option value="dark">夜读</option></select></label><button onClick={() => run(() => api('/settings', data.settings, 'PUT'))}>保存偏好</button></div>}
    <div className="reader-status"><span>{book.format === 'epub' ? (currentChapter ? currentChapter + ' · ' : '') + '阅读进度 ' + Math.round((book.progress || 0) * 100) + '%' : textPages.length ? '第 ' + (textPage + 1) + (paginationDone ? ' / ' + textPages.length : '') + ' 页 · ' + (paginationDone ? '阅读进度 ' + Math.round((book.progress || 0) * 100) + '%' : '正在排版…') : '正在排版…'}</span><form onSubmit={e => { e.preventDefault(); const value = Number(new FormData(e.target).get('position')); if (book.format === 'epub') epubView.current?.goToFraction(Math.max(0, Math.min(100, value)) / 100); else openTextPage(value - 1); }}><label>{book.format === 'epub' ? '跳至进度 %' : '跳至页码'} <input name="position" type="number" min={book.format === 'epub' ? 0 : 1} max={book.format === 'epub' ? 100 : textPages.length} disabled={book.format !== 'epub' && !paginationDone} required/></label><button disabled={book.format !== 'epub' && !paginationDone}>跳转</button></form></div>
    {showToc && <section className="panel reader-toc"><div className="section-head"><h2>章节目录</h2><button onClick={() => setShowToc(false)}>收起</button></div>{toc.length ? tocItems(toc) : <p className="quiet">这本书没有提供章节目录。</p>}</section>}
    {showBookmarks && <section className="panel"><h2>书签</h2>{!(book.bookmarks || []).length && <p className="quiet">还没有书签。</p>}{(book.bookmarks || []).map(mark => <div className="row" key={mark.id}><button disabled={book.format !== 'epub' && !paginationDone} onClick={() => goBookmark(mark)}>{mark.label}</button><span>{Math.round((mark.progress || 0) * 100)}%</span><button onClick={() => saveBook({bookmarks: book.bookmarks.filter(item => item.id !== mark.id)})}>删除书签</button></div>)}</section>}
    <details className="reader-preview"><summary>阅读难度预览</summary><p className="quiet">{readingPreview ? `${book.format==='epub'?'当前章节':'原文'}阅读难度估算（本地计算）：${readingPreview.totalWords} 词，熟悉 ${readingPreview.knownWords}，待学 ${readingPreview.unfamiliarWords}（按高频词与个人学习进度估算）` : '阅读难度正在本地估算。'}</p>{readingPreview?.unknownPreview?.length > 0 && <p className="quiet">预览关键词：{readingPreview.unknownPreview.slice(0, 8).map(w => w.word).join(' · ')}</p>}</details><article ref={reader} className={'reader ' + (data.settings.readingTheme || 'paper')} style={{ fontSize: data.settings.fontSize || 19, lineHeight: data.settings.lineHeight || 1.9 }} onMouseDown={rememberReaderSelection} onClick={e => turnReaderByClick(e, book.format === 'epub')} onMouseUp={() => {
                const t = window.getSelection()?.toString().trim();
                if (t) {
                    S(t);
                    L(null);
                    const para = window.getSelection()?.anchorNode?.parentElement?.closest('p');
                    SC(para?.textContent || t);
                    SL(para?.dataset.offset !== undefined ? 't:' + para.dataset.offset : book.location);
                }
            }} >{book.format !== 'epub' && <>{textPages[textPage]?.text.split('\n').map((paragraph, i, lines) => <p key={i} data-offset={textPages[textPage].start + lines.slice(0, i).reduce((n, line) => n + line.length + 1, 0)}>{paragraph}</p>)}</>}</article>{selection && <div className="selection-panel"><button className="close" onClick={() => { S(''); L(null); }}><X size={17}/></button><b>{selection.slice(0, 180)}</b><div className="actions"><button disabled={busy} onClick={() => run(async () => L(await api('/dictionary/batch',{text:selection})))}>查词</button><button disabled={busy} onClick={() => run(async () => L(await api('/translate', { text: selection })))}>{busy ? '查询中…' : '翻译'}</button><button onClick={() => { setManualWord(false); M('添加单词'); }}>加入生词本</button><button onClick={() => { EX({ target: "句子练习" }); M("添加句子"); }}>加入句子练习</button><button onClick={() => { EX({ target: "听力" }); M("添加句子"); }}>加入听力练习</button><button onClick={() => speak(selection)}>朗读选文</button></div>{lookup && <div>{lookup.entries?.map(e=><p key={e.word}><b>{e.original||e.word}</b> {e.phonetic} · {e.meanings?.join('；') || '词典中暂无释义'}</p>)}{lookup.provider === 'dictionary' && /\s/.test(selection.trim()) && <p className="quiet">当前显示逐词释义，并非完整句译。</p>}{!lookup.entries?.length && <p className="lookup-result">{lookup.phonetic} {(lookup.meanings || []).join('；') || lookup.translation || '词典中暂无释义'}</p>}</div>}</div>}</>}
    {page === '新闻' && <NewsPanel api={api} books={books} refresh={refresh} onBook={openBook} onPractice={(articleId, kind) => { TARGETS(previous => ({ ...previous, [kind]: { articleId, token: Date.now() } })); P(kind === 'listening' ? '听力' : '句子练习'); }} speak={speak}/>}
    {page === '影视' && <section className="panel media-panel"><details className="media-search-settings" open={mediaSearchOpen} onToggle={e=>setMediaSearchOpen(e.currentTarget.open)}><summary>{media ? "更换影片 / 搜索设置" : "搜索影片"}</summary><div className="filter-row">{[["type", "类型", "types"], ["country", "地区", "countries"], ["language", "语言", "languages"]].map(([key, label, group]) => <label key={key}>{label}<select value={mediaFilters[key]} onChange={e => { MF({ ...mediaFilters, [key]: e.target.value }); RS([]); setMediaSearched(false); }}>{categories[group].map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>)}</div><label>当前数据源<select value={mediaSource} onChange={e => { MS(e.target.value); RS([]); setMediaSearched(false); }}><option value="cms">多源搜索 · 苹果 CMS</option><option value="archive">Internet Archive · 公共领域电影</option></select></label><p className="quiet">{media?.source || data.settings.mediaApi || "默认多源影视目录"}</p><form className="search" onSubmit={e => { e.preventDefault(); RS([]); setMediaSearched(false); setMediaResultsOpen(true); setMediaWarning(''); run(async () => { const found = await api('/media/search?' + new URLSearchParams(mediaFilters) + '&source=' + mediaSource + '&q=' + encodeURIComponent(query)); RS(found.results || []); setMediaWarning(found.warning || ''); setMediaSearched(true); }); }}><Search size={18}/><input value={query} onChange={e => Q(e.target.value)} placeholder="输入片名，搜索已配置的数据源"/><button>搜索</button></form>{mediaWarning && <p className="quiet">{mediaWarning}</p>}{mediaSearched && !results.length && <p className="quiet">未找到符合条件的影片。可尝试其他片名、放宽地区和语言筛选，或在设置中更换影视数据源。</p>}{results.length > 0 && <details className="media-results" open={mediaResultsOpen} onToggle={e => setMediaResultsOpen(e.currentTarget.open)}><summary>搜索结果 · {results.length} 条</summary>{results.map((m, i) => <div className="row" key={i}><div><b>{m.title || m.name}</b>{m.sourceName && <p className="quiet">来源：{m.sourceName} · {m.country || "地区未知"} · {m.language || "语言未知"}</p>}</div><button onClick={() => run(async () => {
                    const r = await api('/media/resolve', m);
                    SM({...r,id:m.id,sourceId:m.sourceId,type:m.type});
                    SE(0);
                    SP(false); setTryUnknown(false); if (r.episodes?.length) { setMediaResultsOpen(false); setMediaSearchOpen(false); window.scrollTo(0,0); }
                })}>选择播放</button></div>)}</details>}<label>视频地址<input placeholder="粘贴 MP4 或 HLS 地址" onChange={e => L({ url: e.target.value })}/></label>{lookup?.url && <button onClick={() => { SM({ episodes: [{ title: '自定义地址', url: lookup.url }], subtitles: [] }); SE(0); setTryUnknown(false); SP(false); setMediaResultsOpen(false); setMediaSearchOpen(false); window.scrollTo(0,0); }}>使用此视频</button>}</details>{media && <><h3>{media.title || '视频预习'}</h3><label>选择剧集 / 线路<select value={episode} onChange={e => { SE(+e.target.value); SP(false); setTryUnknown(false); }}>{media.episodes?.map((ep, i) => <option key={i} value={i}>{ep.title}</option>)}</select></label><div className="actions"><button className="primary" onClick={() => SP(true)}>完成预习，开始播放</button><button onClick={() => SP(true)}>跳过预习</button></div>{!media.episodes?.length && <p className="quiet">该来源没有提供可用播放地址，请尝试其他搜索结果。</p>}{playing && media.episodes?.[episode] && (media.episodes[episode].direct === false && !tryUnknown ? <div><p role="alert">此地址不是常见的 M3U8 或 MP4 直链，可能是网页入口。可选择其他线路，也可尝试播放。</p><button onClick={() => setTryUnknown(true)}>尝试播放此地址</button> <a href={media.episodes[episode].url} target="_blank" rel="noreferrer">在浏览器打开</a></div> : <Video key={media.episodes[episode].url} url={media.episodes[episode].url}/>)}</>}{media&&<MediaPreview key={[media.id,media.sourceId,media.title,media.episodes?.[episode]?.url,episode].join('|')} media={media} episode={episode} api={api} run={run} busy={busy} settings={data.settings} refresh={refresh} speak={speak} savedWords={words} addCandidate={addCandidate}/>}</section>}
    {page === '设置' && <><ApiSettings key={JSON.stringify(data.settings)} settings={data.settings} api={api} busy={busy} run={run} refresh={refresh}/><div className="settings"><div><h2>数据与备份</h2><p>书籍、生词和学习记录都在本机。</p></div><section className="panel"><a className="button" href="/api/backup" download="shiju-backup.json">导出完整备份</a><label>选择备份文件<input type="file" accept=".json" onChange={e => { const file = e.target.files[0]; e.target.value = ''; if (file) run(async () => { const value = JSON.parse(await file.text()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份文件格式不正确'); setBackup({ name: file.name, data: value }); }); }}/></label><p className="quiet">恢复备份会替换本地书籍、生词和学习记录，请先导出现有记录。</p>{backup && <div className="backup-confirm"><p>准备恢复：{backup.name}。备份包含 {backup.data.books?.length ?? '未知'} 本书、{backup.data.words?.length ?? '未知'} 个生词、{backup.data.attempts?.length ?? '未知'} 条练习记录。当前记录将被替换。</p><button onClick={() => setBackup(null)}>取消</button> <button className="primary" disabled={busy} onClick={() => run(async () => { await api('/restore', backup.data); window.location.reload(); })}>确认恢复备份</button></div>}</section></div><div className="settings"><div><h2>桌面学习助手</h2></div><section className="panel"><p>拾句提供本地书籍阅读、查词、生词复习、句子练习及听写。阅读选词后可使用离线词典或内置在线翻译；自定义 API 按勾选用途启用，翻译源由系统自动切换。桌面窗口关闭后会保留在系统托盘，点击托盘图标可重新打开；全局快捷键 Ctrl+Shift+E 可查询剪贴板中的文字。</p></section></div></>}
    </div></main>{modal && <div className="overlay"><section className="dialog"><button className="close" onClick={() => M('')} aria-label="关闭"><X size={20}/></button><h2>{modal}</h2>{modal === '添加单词' ? <form onSubmit={e => submitForm(e, '/words', manualWord ? {} : { bookId: book?.id, source: book?.title, location: selectedLocation || book?.location })}><label>英文单词<input name="word" required defaultValue={manualWord ? '' : selection}/></label><label>中文释义<input name="meaning" required defaultValue={manualWord ? '' : (lookup?.meanings || lookup?.entries?.find(e=>e.word?.toLowerCase()===selection.trim().toLowerCase()||e.original?.toLowerCase()===selection.trim().toLowerCase())?.meanings || []).join('；') || (lookup?.provider!=='dictionary'?lookup?.translation:'') || ''}/></label><label>原句语境<textarea name="context" defaultValue={manualWord ? '' : context || selection}/></label><button className="primary" disabled={busy}>保存到生词本</button></form> : modal === '添加句子' ? <form onSubmit={e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); run(async () => { const added = await api('/exercises', { text: f.text, reference: f.reference, keywords: f.keywords.split('\n').filter(Boolean).map(l => { const [english, zh = ''] = l.split('='); return { english: english.trim(), translations: zh.split('/').map(t => t.trim()) }; }), bookId: book?.id, location: selectedLocation || book?.location, source: book?.title }); const target = exercise?.target || '句子练习'; TARGETS(t=>({...t,[target==='听力'?'listening':'sentence']:{exerciseId:added.id,token:Date.now()}}));EX(added); P(target); M(''); refresh(); }); }}><label>英文题目<textarea name="text" required defaultValue={selection}/></label><label>中文参考<textarea name="reference" defaultValue={lookup?.provider!=="dictionary"?lookup?.translation||"":""}/></label><label>确认关键词（每行：英文=中文/同义词）<textarea name="keywords" placeholder="discover=发现/发觉"/></label><button className="primary" disabled={busy}>保存练习</button></form> : <form onSubmit={e => submitForm(e, '/books')}><label>书名<input name="title" required/></label><label>作者<input name="author"/></label><label>粘贴英文原文<textarea name="text" rows="6"/></label><input name="format" value="txt" readOnly hidden/><button className="primary" disabled={busy}>导入文本</button><hr /><label>或选择 TXT / EPUB<input type="file" accept=".txt,.epub" onChange={e => run(async () => {
                    const f = e.target.files[0];
                    if (!f)
                        return;
                    const epub = f.name.toLowerCase().endsWith('.epub');
                    let content;
                    if (epub) {
                        content = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(f); });
                    }
                    await api('/books', { title: f.name.replace(/\.[^.]+$/, ''), format: epub ? 'epub' : 'txt', text: epub ? '' : await f.text(), content });
                    M('');
                    refresh();
                })}/></label></form>}</section></div>}</div>;
}
function Video({ url }) {
    const ref = useRef();
    const [problem, setProblem] = useState('');
    useEffect(() => {
        let hls;
        let disposed = false;
        setProblem('');
        if (/\.m3u8(?:$|[?#])/i.test(url))
            import('hls.js').then(({ default: Hls }) => {
                if (disposed)
                    return;
                if (Hls.isSupported()) {
                    hls = new Hls();
                    hls.on(Hls.Events.ERROR, (_, error) => {
                        if (error.fatal)
                            setProblem(error.type === 'networkError' ? '视频清单或片段无法加载，可能是网络、跨域或片源失效；请切换其他线路。' : error.type === 'mediaError' ? '该线路的音视频格式暂无法解码，请切换其他线路。' : '当前线路无法播放，请切换其他线路。');
                    });
                    hls.loadSource(url);
                    hls.attachMedia(ref.current);
                }
                else
                    ref.current.src = url;
            });
        else
            ref.current.src = url;
        return () => { disposed = true; hls?.destroy(); };
    }, [url]);
    return <><video ref={ref} controls autoPlay onError={() => setProblem('视频无法加载或格式不受支持，请切换其他线路。')} style={{ width: '100%', maxHeight: 440, background: '#171c19' }}/>{problem && <p role="alert">{problem}</p>}</>;
}
