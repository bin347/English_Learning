const { ipcRenderer } = require('electron');

window.addEventListener('mouseup', () => {
  const text = window.getSelection()?.toString().trim();
  if (!text || text.length <= 5000) ipcRenderer.send('news-selection', text || '');
});
