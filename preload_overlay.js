const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  close: () => ipcRenderer.invoke('overlay:self-close'),
  saveScreenshot: (pngBuffer) => ipcRenderer.invoke('overlay:save-screenshot', pngBuffer),
  getScreenSources: () => ipcRenderer.invoke('overlay:get-screen-sources'),
  captureArea: (sourceId, bounds) => ipcRenderer.invoke('overlay:capture-area', sourceId, bounds),
  captureFullScreen: (sourceId) => ipcRenderer.invoke('overlay:capture-fullscreen', sourceId)
});
