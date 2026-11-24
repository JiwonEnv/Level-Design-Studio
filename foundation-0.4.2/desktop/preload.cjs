const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('studioDesktop', {
  chooseSourceFile: () => ipcRenderer.invoke('studio:source-file'),
  previewReference: request => ipcRenderer.invoke('studio:reference-preview',request),
  flattenPsd: request => ipcRenderer.invoke('studio:psd-flatten',request),
  photoCraftOpen: request => ipcRenderer.invoke('studio:photocraft-open',request),
  photoCraftCommand: request => ipcRenderer.invoke('studio:photocraft-command',request),
  photoCraftExport: request => ipcRenderer.invoke('studio:photocraft-export',request),
  photoCraftClose: request => ipcRenderer.invoke('studio:photocraft-close',request),
  analyzeReference: request => ipcRenderer.invoke('studio:reference-analyze',request),
  chooseFolder: kind => ipcRenderer.invoke('studio:folder',kind),
  filePath: file => webUtils.getPathForFile(file),
  updateSettings: next => ipcRenderer.invoke('studio:settings',next),
  info: () => ipcRenderer.invoke('studio:info'),
  chooseWorkspace: () => ipcRenderer.invoke('studio:choose-workspace'),
  showWorkspace: () => ipcRenderer.invoke('studio:show-workspace'),
  saveState: state => ipcRenderer.send('studio:save-state', state),
  closeReady: success => ipcRenderer.send('studio:close-ready', success),
  onClose: callback => ipcRenderer.on('studio:prepare-close', () => callback()),
});

