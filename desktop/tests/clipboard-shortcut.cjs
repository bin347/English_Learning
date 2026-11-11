const fs = require('fs'), vm = require('vm'), assert = require('assert');
const { EventEmitter } = require('events');
const shortcuts = {}, sent = [];
let trayMenu;
class Window extends EventEmitter {
  constructor() { super(); this.webContents = { once() {}, isLoading: () => false, send: (...args) => sent.push(args) }; }
  isDestroyed() { return false; }
  loadFile() {}
  loadURL() { return Promise.resolve(); }
  show() {}
  focus() {}
}
class Tray { setToolTip() {} setContextMenu(menu) { trayMenu = menu; } on() {} }
const app = new EventEmitter();
app.requestSingleInstanceLock = () => true;
app.whenReady = () => Promise.resolve();
app.getPath = () => '.';
const electron = { app, BrowserWindow: Window, Tray, Menu: { buildFromTemplate: x => x },
  globalShortcut: { register: (key, cb) => shortcuts[key] = cb }, ipcMain: { handle() {}, on() {} },
  clipboard: { readText: async () => ' garden ' }, nativeImage: { createFromPath() {} }, net: {} };
const code = fs.readFileSync('desktop/main.cjs', 'utf8').replace(
  "await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.mjs')).href)",
  "({ startServer: async () => ({url:'http://127.0.0.1'}) })"
);
vm.runInNewContext(code, { require: name => name === 'electron' ? electron : require(name), __dirname: 'desktop',
  process: { env: {}, platform: 'test', pid: 1 }, URL, setTimeout, console });
setImmediate(async () => {
  await shortcuts['CommandOrControl+Shift+E']();
  assert.equal(sent.at(-1)[1].text, 'garden');
  await trayMenu.find(item => item.label === '查询剪贴板文本').click();
  assert.equal(sent.at(-1)[1].source, '剪贴板');
  console.log('Clipboard shortcut and tray query passed.');
});
