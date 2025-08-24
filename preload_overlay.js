const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  close: () => ipcRenderer.invoke('overlay:self-close')
});
