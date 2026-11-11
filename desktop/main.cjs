const { app, BrowserWindow, WebContentsView, Tray, Menu, globalShortcut, ipcMain, clipboard, nativeImage, shell, net } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { appendFileSync } = require('fs');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => { if (server) showMain(); });
let paused = false;
let selectionSource = '';
let selectionUrl = '';
const newsHost = host => ['www.chinadaily.com.cn', 'english.news.cn', 'globalvoices.org', 'www.globalvoices.org'].includes(host);
const validNewsUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && newsHost(url.hostname); }
  catch { return false; }
};
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  contents.on('will-navigate', (event, url) => {
    if (contents === newsView?.webContents && validNewsUrl(url)) return;
    const allowed = url.startsWith('file://') || (server && new URL(url).origin === new URL(server.url).origin) || (process.env.ENGLISH_DEV_URL && new URL(url).origin === new URL(process.env.ENGLISH_DEV_URL).origin);
    if (!allowed) { event.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });
});
let mainWindow, newsView, popup, trigger, tray, server, watcher, selected = '';
const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
function loadMainPage() {
  const target = process.env.ENGLISH_DEV_URL || server.url;
  mainWindow.loadURL(target).catch(error => {
    appendFileSync(path.join(app.getPath('userData'), 'startup.log'), `${new Date().toISOString()} ${error.message}\n`);
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>英语学习助手</title><body style="font:16px system-ui;padding:60px;color:#263c33"><h1>学习页面暂时未能加载</h1><p>请重新加载页面。如果仍无法打开，请从托盘退出后重新启动。</p><a href="${target}">重新加载</a></body></html>`));
    mainWindow.show();
  });
}
function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({ width: 1100, height: 760, show: false, backgroundColor: '#fbfcfa', webPreferences: { preload: path.join(__dirname, 'app-preload.cjs'), contextIsolation: true, nodeIntegration: false } });
    mainWindow.on('close', e => { if (!app.quitting) { e.preventDefault(); mainWindow.hide(); } });
    mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.focus(); });
    loadMainPage();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function openNews(url, bounds) {
  if (!validNewsUrl(url)) throw new Error('仅支持已接入的新闻来源');
  closeNews();
  newsView = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'news-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'news-reading' } });
  newsView.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  mainWindow.contentView.addChildView(newsView);
  newsView.setBounds(bounds);
  if (new URL(url).hostname === 'www.chinadaily.com.cn') newsView.webContents.setZoomFactor(Math.min(1, bounds.width / 1200));
  return newsView.webContents.loadURL(url);
}
function closeNews() {
  if (!newsView) return;
  mainWindow.contentView.removeChildView(newsView);
  newsView.webContents.close();
  newsView = null;
  clearSelection();
}
function clearSelection() {
  selected = '';
  if (trigger && !trigger.isDestroyed()) trigger.destroy();
  if (popup && !popup.isDestroyed()) popup.hide();
}
function offerSelection(text, source) {
  if (!text || !text.trim()) return;
  selected = text.trim();
  selectionSource = source || '外部应用';
  if (trigger && !trigger.isDestroyed()) trigger.destroy();
  const point = require('electron').screen.getCursorScreenPoint();
  trigger = new BrowserWindow({ width: 76, height: 36, x: point.x, y: point.y, frame: false, show: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  const current = trigger;
  current.loadFile(path.join(__dirname, 'trigger.html'));
  current.once('ready-to-show', () => { if (!current.isDestroyed()) current.showInactive(); });
  setTimeout(() => { if (!current.isDestroyed()) current.destroy(); }, 10000);
}
function showSelection(text) {
  if (!text || !text.trim()) return;
  selected = text.trim();
  if (!popup || popup.isDestroyed()) {
    popup = new BrowserWindow({ width: 360, height: 450, show: false, alwaysOnTop: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
    popup.loadFile(path.join(__dirname, 'popup.html'));
  }
  popup.webContents.once('did-finish-load', () => popup.webContents.send('selection', { text: selected, source: selectionSource, sourceUrl: selectionUrl }));
  if (!popup.webContents.isLoading()) popup.webContents.send('selection', { text: selected, source: selectionSource, sourceUrl: selectionUrl });
  popup.show();
}
app.whenReady().then(async () => {
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.mjs')).href);
  server = await startServer({ dataDir: app.getPath('userData'), port: 0, staticDir: path.join(__dirname, '..', 'frontend', 'dist'), translationFetch: (url, options) => net.fetch(String(url), options), aiFetch: (url, options) => net.fetch(String(url), options), newsFetch: (url, options) => net.fetch(String(url), options) });
  tray = new Tray(icon); tray.setToolTip('英语学习助手');
  function updateTray() { tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开主窗口', click: showMain }, { label: '查询剪贴板文本', click: () => { selectionSource = '剪贴板'; selectionUrl = ''; showSelection(clipboard.readText()); } }, { label: paused ? '恢复划词' : '暂停划词', click: () => { paused = !paused; if (paused) trigger?.destroy(); updateTray(); } }, { type: 'separator' }, { label: '退出', click: () => { app.quitting = true; app.quit(); } }])); }
  updateTray();
  tray.on('double-click', showMain);
  globalShortcut.register('CommandOrControl+Shift+E', () => { selectionSource = '剪贴板'; selectionUrl = ''; showSelection(clipboard.readText()); });
  ipcMain.handle('open-news', async (event, url, bounds) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('新闻入口无效');
    await openNews(url, bounds);
    return { ok: true };
  });
  ipcMain.on('news-bounds', (event, bounds) => {
    if (event.sender === mainWindow?.webContents && newsView && bounds?.width > 0 && bounds?.height > 0) {
      newsView.setBounds(bounds);
      if (bounds.width > 200 && newsView.webContents.getURL().startsWith('https://www.chinadaily.com.cn/')) newsView.webContents.setZoomFactor(Math.min(1, bounds.width / 1200));
    }
  });
  ipcMain.on('close-news', event => { if (event.sender === mainWindow?.webContents) closeNews(); });
  ipcMain.on('news-open-external', event => { const url = newsView?.webContents.getURL(); if (event.sender === mainWindow?.webContents && validNewsUrl(url)) shell.openExternal(url); });
  ipcMain.handle('news-article', async event => {
    if (event.sender !== mainWindow?.webContents || !newsView || !validNewsUrl(newsView.webContents.getURL())) throw new Error('新闻页面尚未就绪');
    const address = new URL(newsView.webContents.getURL());
    if (!(/^\/a\/20\d{4}\/\d{2}\/WS[\da-f]+\.html$/i.test(address.pathname) || /^\/20\d{6}\/[\da-f]+\/c\.html$/i.test(address.pathname) || /^\/20\d{2}\/\d{2}\/\d{2}\/[a-z0-9-]+\/$/i.test(address.pathname))) throw new Error('请先在原站打开一篇具体新闻');
    const text = await newsView.webContents.executeJavaScript(`(() => {
      const roots = ['#Content', '#content', '.article-content', '.article_content', '[itemprop="articleBody"]', 'article', '.detail', 'main'].flatMap(selector => [...document.querySelectorAll(selector)]);
      const paragraphs = root => [...root.querySelectorAll('p')].filter(p => !p.closest('aside, nav, footer')).map(p => p.innerText.trim()).filter(p => p.length > 15);
      const body = roots.map(root => paragraphs(root)).find(parts => parts.join(' ').length > 200) || [];
      return { title: document.querySelector('h1')?.innerText.trim() || document.title, text: body.join('\\n\\n'), author: document.querySelector('meta[name="author"]')?.content || '' };
    })()`);
    if (text.text.length < 200) throw new Error('未能提取足够的正文，请在原站阅读');
    return { ...text, url: newsView.webContents.getURL() };
  });
  ipcMain.on('news-selection', (event, text) => {
    if (event.sender !== newsView?.webContents || !validNewsUrl(event.sender.getURL()) || typeof text !== 'string' || text.length > 5000) return;
    if (!text.trim()) { clearSelection(); return; }
    selectionUrl = event.sender.getURL();
    selectionSource = newsView.webContents.getTitle() || '新闻原文';
    offerSelection(text, selectionSource);
  });
  ipcMain.on('clear-selection', event => { if (event.sender === mainWindow?.webContents) clearSelection(); });
  ipcMain.on('open-selection', () => { trigger?.destroy(); showSelection(selected); });
  ipcMain.handle('lookup', async (_, text) => {
    const sentence = /\s/.test(text.trim());
    const response = await fetch(sentence ? `${server.url}/api/translate` : `${server.url}/api/dictionary?q=${encodeURIComponent(text)}`, sentence ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) } : {});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '查询失败');
    return data;
  });
  ipcMain.handle('save-word', async (_, payload) => {
    const response = await fetch(`${server.url}/api/words`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '保存失败');
    return data;
  });
  ipcMain.handle('save-selection-exercise', async (event, kind) => {
    if (event.sender !== popup?.webContents || !['sentence', 'listening'].includes(kind) || !selected || selected.length > 5000) throw new Error('练习内容无效');
    const response = await fetch(`${server.url}/api/exercises`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: selected, reference: '', source: selectionSource, sourceUrl: selectionUrl }) });
    const exercise = await response.json();
    if (!response.ok) throw new Error(exercise.error || '保存练习失败');
    popup.hide();
    showMain();
    mainWindow.webContents.send('open-practice', { exerciseId: exercise.id, kind });
    return { ok: true };
  });
  ipcMain.on('close-popup', () => popup?.hide());
  ipcMain.on('open-settings', () => { showMain(); mainWindow.webContents.send('open-settings'); });
  ipcMain.on('open-external', (_, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
  if (process.platform === 'win32') {
    const watcherPath = path.join(__dirname, 'selection.ps1').replace('app.asar', 'app.asar.unpacked');
    watcher = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', watcherPath], { windowsHide: true });
    let buffer = '';
    watcher.stdout.on('data', chunk => { buffer += chunk.toString(); const lines = buffer.split(/\r?\n/); buffer = lines.pop(); for (const line of lines) { try { const value = JSON.parse(line); if (!paused && value.processId !== process.pid) { if (value.text) { selectionUrl = ''; offerSelection(value.text, value.source); } else clearSelection(); } } catch {} } });
  }
  showMain();
});
app.on('before-quit', () => { app.quitting = true; closeNews(); watcher?.kill(); globalShortcut.unregisterAll(); server?.close(); });
app.on('window-all-closed', () => {});


