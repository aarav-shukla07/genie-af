const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Helpful on some Linux WMs for transparent windows
app.commandLine.appendSwitch('enable-transparent-visuals');

let mainWin = null;
let overlayWin = null;

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 700,
    minHeight: 450,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWin.loadFile('index.html');

  mainWin.on('closed', () => {
    mainWin = null;
  });
}

function createOverlayWindow() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.focus();
    return;
  }

  overlayWin = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,                 // no title bar
    transparent: true,            // transparent background
    alwaysOnTop: true,            // float over everything
    resizable: true,              // allow user to resize if they want
    hasShadow: false,
    backgroundColor: '#00000000', // explicit fully transparent bg
    movable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload_overlay.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWin.loadFile('overlay.html');

  // If main window goes, overlay should go too
  overlayWin.on('closed', () => {
    overlayWin = null;
  });
}

// IPC from renderer (main window)
ipcMain.handle('overlay:show', () => {
  createOverlayWindow();
  return true;
});

ipcMain.handle('overlay:hide', () => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.close();
  }
  return true;
});

// Optional: allow overlay to request closing itself
ipcMain.handle('overlay:self-close', () => {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close();
  return true;
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  // On Linux/Windows, quit when all windows closed
  if (process.platform !== 'darwin') app.quit();
});
