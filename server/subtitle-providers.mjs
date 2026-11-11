import { unzipSync } from 'fflate';

const subtitleDB = 'https://api.thesubtitledb.org';
const gestdown = 'https://api.gestdown.info';
const yify = 'https://yifysubtitles.ch';
const downloadLimit = 2_000_000;
const normalize = value => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const identifier = /^[\w-]{1,80}$/;

async function get(url, options, request = fetch) {
  const response = await request(url, { ...options, signal: AbortSignal.timeout(6500) });
  if (response.status === 404) return null;
  if (!response.ok) throw Error('字幕服务暂不可用');
  return response;
}

function subtitleDBId(address) {
  return /^https:\/\/api\.thesubtitledb\.org\/get\/(\d+)$/.exec(address)?.[1];
}

async function fromSubtitleDB({title, imdbId, year, type, season, episode}, request) {
  const byId = /^tt\d{5,12}$/.test(imdbId || '');
  const scope = type === 'tv' ? '/season/' + season + '/episode/' + episode : '';
  const path = byId ? '/v1/by-imdb/' + imdbId : '/v1/by-title';
  const url = new URL(path + scope, subtitleDB);
  url.search = new URLSearchParams({lang:'en', limit:'15', client:'shiju'});
  if (!byId) url.searchParams.set('q', title);
  const result = await (await get(url, undefined, request))?.json();
  if (!result?.title || (result.title.media_type && result.title.media_type !== type)) return [];
  const match = result.title;
  const exact = byId ? match.imdb === imdbId : !!year && Number(match.year) === year && normalize(match.name) === normalize(title);
  if (byId && !exact) return [];
  return (result.subtitles?.items ?? []).flatMap(item => {
    const id = subtitleDBId(item.download_url);
    if (!id || item.language !== 'en' || !/^(srt|vtt|ass|ssa)$/i.test(item.format) || item.bytes > downloadLimit) return [];
    if (type === 'tv' && ((item.season != null && item.season !== season) || (item.episode != null && item.episode !== episode))) return [];
    return [{provider:'subtitledb', id, title:match.name || title, year:match.year, tmdbId:match.tmdb_id, label:item.release_name, exact}];
  }).slice(0,5);
}

async function fromGestdown({title, type, season, episode, tvdbId}, request) {
  if (type !== 'tv' || title.length < 3) return [];
  const result = await (await get(gestdown + '/shows/search/' + encodeURIComponent(title), undefined, request))?.json();
  const matches = (result?.shows ?? []).filter(show => identifier.test(show.id ?? '') && normalize(show.name) &&
    (normalize(show.name) === normalize(title) || normalize(show.name.replace(/\s*\((?:US|UK)\)$/i, '')) === normalize(title)) &&
    (!tvdbId || String(show.tvDbId) === String(tvdbId)));
  const outcomes = await Promise.allSettled(matches.slice(0,3).map(async show => {
    const found = await (await get(gestdown + '/subtitles/get/' + show.id + '/' + season + '/' + episode + '/en', undefined, request))?.json();
    if (!found || Number(found.episode?.season) !== season || Number(found.episode?.number) !== episode) return [];
    return (found.matchingSubtitles ?? []).filter(sub => sub.completed && sub.language === 'English' &&
      identifier.test(sub.subtitleId ?? '') && sub.downloadUri === '/subtitles/download/' + sub.subtitleId)
      .slice(0,3).map(sub => ({provider:'gestdown', id:sub.subtitleId, title:show.name, tmdbId:show.tmdbId, label:sub.version,
        exact:(!!tvdbId && String(show.tvDbId) === String(tvdbId)) || (/\((?:US|UK)\)$/i.test(title) && normalize(show.name) === normalize(title))}));
  }));
  if (outcomes.length && outcomes.every(item=>item.status==='rejected')) throw outcomes[0].reason;
  return outcomes.flatMap(item=>item.status==='fulfilled'?item.value:[]);
}

async function fromYify({title,year,imdbId}, request) {
  let matches;
  if (/^tt\d{5,12}$/.test(imdbId || '')) {
    matches = [{id:imdbId,name:title,releaseInfo:year}];
  } else {
    const url='https://v3-cinemeta.strem.io/catalog/movie/top/search='+encodeURIComponent(title)+'.json';
    const catalog=await (await get(url, undefined, request))?.json();
    matches=(catalog?.metas ?? []).filter(movie=>/^tt\d{5,12}$/.test(movie.id || '') &&
      normalize(movie.name)===normalize(title) && (!year || Number(movie.releaseInfo)===year)).slice(0,2);
  }
  const results=await Promise.allSettled(matches.map(async movie=>{
    const response=await get(yify + '/movie-imdb/' + movie.id, undefined, request);
    if (!response) return [];
    const html=await response.text();
    return [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].flatMap(([row])=>{
      if (!/<span\b[^>]*class=["']sub-lang["'][^>]*>\s*English\s*<\/span>/i.test(row)) return [];
      const id=/href=["']\/subtitles\/([a-z0-9-]{1,240})["']/i.exec(row)?.[1];
      return id ? [{provider:'yify',id,title:movie.name,year:Number(movie.releaseInfo)||undefined,
        label:'英文字幕 · '+id.split('-').at(-1),exact:!!imdbId||!!year}] : [];
    }).slice(0,4);
  }));
  if (results.length && results.every(result=>result.status==='rejected')) throw results[0].reason;
  return results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
}

async function resolveSeries({title,year}, request) {
  if (!year) return null;
  const name=title.replace(/[（(]\s*(?:英版|美版|英国版|美国版|UK|US)\s*[）)]/gi,'').trim();
  let names=[name];
  if (/[\u3400-\u9fff]/.test(name)) {
    const endpoint=new URL('https://www.wikidata.org/w/api.php');
    endpoint.search=new URLSearchParams({action:'wbsearchentities',search:name,language:'zh',format:'json',limit:'10'});
    const result=await (await get(endpoint,{headers:{'User-Agent':'EnglishStudyAssistant/0.2 (local learning app)','Accept':'application/json'}},request))?.json();
    names=[...new Set((result?.search || []).filter(item=>normalize(item.match?.text)===normalize(name) &&
      item.display?.label?.language==='en' && /\b(?:television|tv)\b.*\b(?:series|show|program|programme)\b/i.test(item.description || '')).map(item=>item.display.label.value))];
  }
  if (names.length!==1) return null;
  const lookup=new URL('https://api.tvmaze.com/search/shows');
  lookup.searchParams.set('q',names[0]);
  const shows=await (await get(lookup,undefined,request))?.json();
  const country=/[（(]\s*(?:英版|英国版|UK)\s*[）)]/i.test(title)?'GB':/[（(]\s*(?:美版|美国版|US)\s*[）)]/i.test(title)?'US':'';
  const matches=(shows || []).map(item=>item.show).filter(show=>normalize(show.name)===normalize(names[0]) && Number(show.premiered?.slice(0,4))===year && /^tt\d{5,12}$/.test(show.externals?.imdb || '') && (!country || (show.network?.country?.code || show.webChannel?.country?.code)===country));
  if (matches.length!==1) return null;
  return {title:matches[0].name,imdbId:matches[0].externals.imdb,tvdbId:matches[0].externals.thetvdb,year};
}

export async function searchSubtitles(query, request = fetch) {
  let resolved;
  if (query.type==='tv' && !query.imdbId) {
    try { resolved=await resolveSeries(query,request); } catch { /* Original-title lookup remains available. */ }
  }
  const searchQuery=resolved ? {...query,...resolved} : query;
  const providers = [['SubtitleDB',fromSubtitleDB], query.type === 'tv' ? ['Gestdown',fromGestdown] : ['YIFY Subtitles',fromYify]];
  const results = await Promise.allSettled(providers.map(([,search])=>search(searchQuery,request)));
  const sources = results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  const matched = sources.find(source=>source.provider==='subtitledb' && source.exact && Number.isInteger(source.tmdbId) && source.tmdbId>0);
  return {
    sources:sources.map(({tmdbId,...source})=>matched && tmdbId===matched.tmdbId
      ? {...source,exact:true,year:matched.year}
      : source),
    warnings:results.flatMap((result,i)=>result.status==='rejected'?[providers[i][0] + ' 暂不可用']:[]),
    ...(resolved ? {resolvedTitle:resolved.title,resolvedYear:resolved.year} : {})
  };
}

async function trustedDownload(url, hosts, headers, request = fetch) {
  for (let redirects=0; redirects<4; redirects++) {
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !hosts.includes(url.hostname)) throw Error('字幕下载地址无效');
    const response = await request(url, {headers,redirect:'manual',signal:AbortSignal.timeout(6500)});
    const next = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && next) {
      url = new URL(next,url);
      continue;
    }
    if (!response.ok || !response.body) throw Error('字幕下载失败');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > downloadLimit) throw Error('字幕文件过大');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks,size);
  }
  throw Error('字幕下载跳转次数过多');
}

export async function downloadSubtitle(provider,id,request = fetch) {
  if (typeof id !== 'string' || !/^[\w-]{1,240}$/.test(id)) throw Error('字幕编号无效');
  let bytes;
  if (provider === 'subtitledb' && /^\d+$/.test(id)) {
    bytes = await trustedDownload(new URL('/get/' + id,subtitleDB), ['api.thesubtitledb.org','files.thesubtitledb.org'],undefined,request);
  } else if (provider === 'gestdown') {
    bytes = await trustedDownload(new URL('/subtitles/download/' + id,gestdown), ['api.gestdown.info'],undefined,request);
  } else if (provider === 'yify' && /^[a-z0-9-]+$/.test(id)) {
    const zip = await trustedDownload(new URL('/subtitle/' + id + '.zip',yify), ['yifysubtitles.ch'],
      {Referer:yify + '/subtitles/' + id},request);
    const files = unzipSync(zip,{filter:file=>/\.(srt|vtt|ass|ssa)$/i.test(file.name)&&file.originalSize<=downloadLimit});
    const subtitles = Object.values(files);
    if (subtitles.length !== 1) throw Error('字幕压缩包没有唯一可用的字幕，请换一条');
    [bytes] = subtitles;
  } else throw Error('字幕来源无效');
  if (bytes[0]===255 && bytes[1]===254) return new TextDecoder('utf-16le').decode(bytes);
  const utf8 = new TextDecoder().decode(bytes);
  return utf8.includes('\ufffd') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
}
