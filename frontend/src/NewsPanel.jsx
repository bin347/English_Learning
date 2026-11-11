import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Search, Volume2, X } from 'lucide-react';

export default function NewsPanel({ api, books, refresh, onBook, onPractice, speak }) {
    const [source, setSource] = useState('');
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [retry, setRetry] = useState(0);
    const [sources, setSources] = useState([]);
    const [results, setResults] = useState([]);
    const [warning, setWarning] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [article, setArticle] = useState(null);
    const [embedded, setEmbedded] = useState(null);
    const embeddedSlot = useRef(null);
    const [selection, setSelection] = useState('');
    const [context, setContext] = useState('');
    const [lookup, setLookup] = useState(null);
    const [addingWord, setAddingWord] = useState(false);
    const [meaning, setMeaning] = useState('');
    const [working, setWorking] = useState(false);

    useEffect(() => {
        if (!embedded || !window.electronNews) return;
        const bounds = () => {
            const rect = embeddedSlot.current?.getBoundingClientRect();
            if (!rect) return { x: 0, y: 0, width: 1, height: 1 };
            const x = Math.max(0, Math.round(rect.left));
            const y = Math.max(0, Math.round(rect.top));
            return { x, y, width: Math.max(1, Math.round(Math.min(rect.right, window.innerWidth) - x)), height: Math.max(1, Math.round(Math.min(rect.bottom, window.innerHeight) - y)) };
        };
        const update = () => window.electronNews.setBounds(bounds());
        const observer = new ResizeObserver(update);
        observer.observe(embeddedSlot.current);
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        let active = true;
        window.electronNews.open(embedded.url, bounds()).catch(() => {
            if (active) { setEmbedded(null); setError('新闻页面加载失败，请检查网络后重试，或在浏览器中打开原文。'); }
        });
        return () => { active = false; observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); window.electronNews.close(); };
    }, [embedded?.url]);

    useEffect(() => {
        if (!selection) return;
        const clear = event => {
            if (!event.target.closest('.selection-panel') && !window.getSelection()?.toString().trim()) {
                setSelection(''); setLookup(null); setAddingWord(false);
            }
        };
        document.addEventListener('pointerup', clear);
        return () => document.removeEventListener('pointerup', clear);
    }, [selection]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        api('/news?' + new URLSearchParams({ source, q: search }), undefined, undefined, controller.signal)
            .then(data => {
                setSources(data.sources || []);
                setResults(data.results || []);
                setWarning(data.warning || '');
            })
            .catch(reason => { if (reason.name !== 'AbortError') setError(reason.message); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [api, source, search, retry]);

    async function readArticle(item) {
        setWorking(true);
        setError('');
        try {
            const loaded = await api('/news/article?url=' + encodeURIComponent(item.url));
            setArticle(loaded);
            setEmbedded(null);
            setSelection('');
            setLookup(null);
        } catch (reason) { setError('读取正文失败：' + reason.message + '。可通过原文链接阅读。'); }
        finally { setWorking(false); }
    }

    function openNews(event, item) {
        if (!window.electronNews) return;
        event.preventDefault();
        setArticle(null);
        setEmbedded(item);
        setError('');
    }

    async function saveArticle(kind) {
        setWorking(true);
        setError('');
        try {
            const current = article || { ...await window.electronNews.extractArticle(), source: embedded.source, publishedAt: embedded.publishedAt };
            let book = books.find(item => item.sourceUrl === current.url);
            if (!book) book = await api('/books', { title: current.title, author: current.author, text: current.text, format: 'txt', source: current.source, sourceUrl: current.url, license: current.license, licenseUrl: current.licenseUrl, changes: current.changes });
            if (kind === 'book') {
                await refresh();
                onBook(book);
            } else {
                const added = await api('/article-practice', { bookId: book.id });
                await refresh();
                onPractice(added.articleId, kind);
            }
        } catch (reason) { setError('保存新闻失败：' + reason.message); }
        finally { setWorking(false); }
    }

    async function lookUp(path) {
        setWorking(true);
        setError('');
        try {
            let result = await api(path, { text: selection });
            if (path === '/dictionary/batch' && /^[a-z]+(?:['’-][a-z]+)*$/i.test(selection) && !result.entries?.[0]?.meanings?.length) result = await api('/translate', { text: selection });
            setLookup(result);
        }
        catch (reason) { setError('查译失败：' + reason.message); }
        finally { setWorking(false); }
    }

    function beginWord() {
        setMeaning(lookup?.entries?.[0]?.meanings?.join('；') || lookup?.translation || '');
        setAddingWord(true);
    }

    async function saveWord(event) {
        event.preventDefault();
        setWorking(true);
        setError('');
        try {
            await api('/words', { word: selection, meaning, context, source: article.title, sourceUrl: article.url, bookId: books.find(item => item.sourceUrl === article.url)?.id });
            await refresh();
            setAddingWord(false);
            setSelection('');
            setLookup(null);
        } catch (reason) { setError('保存生词失败：' + reason.message); }
        finally { setWorking(false); }
    }

    return <>
        {error && !embedded && <p className="news-error" role="alert">{error} <button onClick={() => { setError(''); setRetry(n => n + 1); }}>重试列表</button></p>}
        {embedded ? <>
            <div className="reader-toolbar"><button onClick={() => setEmbedded(null)}><ArrowLeft size={16}/>返回新闻</button><button disabled={working} onClick={() => saveArticle('book')}>导入书架</button><button disabled={working} onClick={() => saveArticle('sentence')}>导入并练句子</button><button disabled={working} onClick={() => saveArticle('listening')}>导入并练听力</button><button onClick={() => window.electronNews.openExternal()}>在浏览器打开 <ArrowUpRight size={16}/></button></div>
            {error && <p className="news-error" role="alert">{error}</p>}
            <p className="quiet">在原站页面直接划词。导入仅保存到本机用于个人学习，保留来源链接；个别网页如正文结构变化，可能无法提取。</p>
            <div className="news-embedded" ref={embeddedSlot} role="region" aria-label="新闻原站阅读区"/>
        </> : article ? <>
            <div className="reader-toolbar"><button onClick={() => { setArticle(null); setSelection(''); setLookup(null); }}><ArrowLeft size={16}/>返回新闻</button><button disabled={working} onClick={() => saveArticle('book')}>保存到书架</button><button disabled={working || !article.text} onClick={() => saveArticle('sentence')}>整篇句子练习</button><button disabled={working || !article.text} onClick={() => saveArticle('listening')}>整篇听力练习</button></div>
            <p className="quiet">新闻暂无预设中文参考和评分关键词。听英文写英文可对照评分；中文理解若未配置 AI 评分，则需自行对照，无法给准确语义分数。无 API 时仍会尝试内置在线翻译；完全离线时仅提供词典逐词释义。</p>
            <article className="news-reader" onMouseUp={() => {
                const selected = window.getSelection()?.toString().trim();
                if (selected) {
                    setSelection(selected);
                    setContext(window.getSelection()?.anchorNode?.parentElement?.closest('p')?.textContent || selected);
                    setLookup(null);
                    setAddingWord(false);
                } else { setSelection(''); setLookup(null); setAddingWord(false); }
            }}>
                <h2>{article.title}</h2>
                <p className="news-credit">作者：{article.author} · 来源：<a href={article.url} target="_blank" rel="noopener noreferrer">{article.source} <ArrowUpRight size={14}/></a> · {article.publishedAt && new Date(article.publishedAt).toLocaleDateString('zh-CN')} · 文字许可：<a href={article.licenseUrl} target="_blank" rel="noopener noreferrer">{article.license}</a>{article.changes && <> · {article.changes}</>}</p>
                {article.text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </article>
            {selection && <div className="selection-panel" role="region" aria-label="新闻划词工具"><button className="close" aria-label="关闭划词工具" onClick={() => { setSelection(''); setLookup(null); setAddingWord(false); }}><X size={17}/></button><b>{selection.slice(0, 180)}</b><div className="actions"><button disabled={working} onClick={() => lookUp('/dictionary/batch')}>查词</button><button disabled={working} onClick={() => lookUp(/^[a-z]+(?:['’-][a-z]+)*$/i.test(selection) ? '/dictionary/batch' : '/translate')}>翻译</button><button disabled={working} onClick={beginWord}>加入生词本</button><button onClick={() => speak(selection)}><Volume2 size={16}/>朗读</button></div>{lookup && <div>{lookup.entries?.map(entry => <p key={entry.word}><b>{entry.original || entry.word}</b> {entry.phonetic} · {entry.meanings?.join('；') || '词典中暂无释义'}</p>)}{!lookup.entries?.length && <p className="lookup-result">{lookup.translation || '暂未找到释义。'}</p>}{lookup.provider === 'dictionary' && /\s/.test(selection) && <p className="quiet">当前是逐词释义，并非完整句译。</p>}</div>}{addingWord && <form className="news-word-form" onSubmit={saveWord}><label>中文释义<input aria-label="新闻生词释义" value={meaning} onChange={event => setMeaning(event.target.value)} required/></label><button className="primary" disabled={working || !meaning.trim()}>确认加入生词本</button></form>}</div>}
        </> : <>
            <section className="panel news-intro"><h2>从英文新闻中学习</h2><p>在软件内阅读英文新闻，划词翻译，并将文章导入书架或整篇练习。</p><p className="quiet">新闻版权归原站或作者所有。导入内容仅保存在本机，保留来源与原文链接。</p></section>
            <section className="panel"><form className="news-search" onSubmit={event => { event.preventDefault(); setSearch(query.trim()); setRetry(n => n + 1); }}><label>新闻来源<select aria-label="新闻来源" value={source} onChange={event => setSource(event.target.value)}><option value="">全部来源</option>{sources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>标题关键词<input aria-label="新闻标题关键词" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入英文关键词"/></label><button type="submit" disabled={loading}><Search size={16}/>搜索</button></form>
                {warning && <p role="status" className="quiet">{warning}</p>}{loading ? <p className="quiet">正在读取新闻目录…</p> : !results.length && !error ? <p className="quiet">暂无符合条件的新闻。可以换个关键词或来源重试。</p> : results.map(item => <article className="news-item" key={item.id || item.url}><div><span className="muted">{item.source}{item.publishedAt ? ' · ' + new Date(item.publishedAt).toLocaleDateString('zh-CN') : ''}</span><h3>{item.title}</h3>{item.summary && <p>{item.summary}</p>}</div><div className="news-item-actions">{item.readable && <button disabled={working} onClick={() => readArticle(item)}>纯文本阅读</button>}<a className="button" href={item.url} target="_blank" rel="noopener noreferrer" onClick={event => openNews(event, item)}>{window.electronNews ? (item.readable ? '阅读原站' : '阅读') : '打开原文'} <ArrowUpRight size={16}/></a></div></article>)}
                {!loading && sources.some(item => item.url || item.homepage) && <div className="news-source-links"><span>来源官网：</span>{sources.filter(item => item.url || item.homepage).map(item => <a key={item.id} href={item.url || item.homepage} target="_blank" rel="noopener noreferrer" onClick={event => openNews(event, { url: item.url || item.homepage, source: item.name })}>{item.name} <ArrowUpRight size={13}/></a>)}</div>}</section>
        </>}
    </>;
}
