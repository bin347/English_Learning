const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronNews', {
  open: (url, bounds) => ipcRenderer.invoke('open-news', url, bounds),
  setBounds: bounds => ipcRenderer.send('news-bounds', bounds),
  close: () => ipcRenderer.send('close-news'),
  openExternal: () => ipcRenderer.send('news-open-external'),
  extractArticle: () => ipcRenderer.invoke('news-article'),
  onPractice: callback => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('open-practice', listener);
    return () => ipcRenderer.removeListener('open-practice', listener);
  }
});

window.addEventListener('mouseup', () => {
  if (!window.getSelection()?.toString().trim()) ipcRenderer.send('clear-selection');
});
