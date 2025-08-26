const { app, BrowserWindow, ipcMain, desktopCapturer, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const fetch = require('cross-fetch');
const Tesseract = require('tesseract.js');

const execAsync = promisify(exec);

// Helpful on some Linux WMs for transparent windows
app.commandLine.appendSwitch('enable-transparent-visuals');

// Add Wayland support for screen capture
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('allow-running-insecure-content');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');

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

  // Get primary display bounds
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  overlayWin = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    frame: false,                 // no title bar
    transparent: true,            // transparent background
    alwaysOnTop: true,            // float over everything
    resizable: false,             // fixed size to cover screen
    hasShadow: false,
    backgroundColor: '#00000000', // explicit fully transparent bg
    movable: false,               // fixed position
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

// Handle screenshot saving
ipcMain.handle('overlay:save-screenshot', async (event, pngBuffer) => {
  try {
    const picturesPath = app.getPath('pictures');
    const filePath = path.join(picturesPath, `screenshot-${Date.now()}.png`);

    fs.writeFileSync(filePath, pngBuffer);
    console.log(`✅ Screenshot saved: ${filePath}`);
    return filePath;
  } catch (err) {
    console.error("❌ Error saving screenshot:", err);
    return null;
  }
});

// Handle area capture
ipcMain.handle('overlay:capture-area', async (event, sourceId, bounds) => {
  try {
    console.log("📸 Capturing area:", bounds);
    
    // Temporarily hide the overlay to capture the content behind it
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.hide();
      // Wait a bit for the overlay to hide
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    try {
      // Use native screenshot method
      const result = await nativeScreenshot(bounds);
      
      // Show the overlay again
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.show();
      }
      
      return result;
    } catch (err) {
      // Show the overlay again even if screenshot failed
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.show();
      }
      throw err;
    }
  } catch (err) {
    console.error("❌ Error capturing area:", err);
    return null;
  }
});

// Native screenshot method using desktopCapturer with Wayland workaround
async function nativeScreenshot(bounds = null) {
  try {
    const picturesPath = app.getPath('pictures');
    const timestamp = Date.now();
    
    console.log("📸 Attempting to capture screenshot...");
    
    // Try to get screen sources with different approaches
    let sources = [];
    try {
      // First try with standard approach
      const { width, height } = screen.getPrimaryDisplay().bounds;
      sources = await desktopCapturer.getSources({ 
        types: ['screen'],
        thumbnailSize: { width, height }
      });
      console.log(`✅ Found ${sources.length} screen sources`);
    } catch (err) {
      console.log("🔄 Standard approach failed, trying alternative...");
      try {
        // Try with smaller thumbnail size
        sources = await desktopCapturer.getSources({ 
          types: ['screen'],
          thumbnailSize: { width: 800, height: 600 }
        });
        console.log(`✅ Alternative approach found ${sources.length} sources`);
      } catch (altErr) {
        console.log("🔄 Alternative approach also failed, trying minimal...");
        // Try with minimal settings
        sources = await desktopCapturer.getSources({ 
          types: ['screen']
        });
        console.log(`✅ Minimal approach found ${sources.length} sources`);
      }
    }
    
    if (!sources.length) {
      throw new Error('No screen sources found');
    }
    
    const screenSource = sources[0];
    const image = screenSource.thumbnail;
    
    if (bounds) {
      // Capture specific area
      const filePath = path.join(picturesPath, `screenshot-area-native-${timestamp}.png`);
      
      console.log("📸 Capturing area:", bounds);
      
      // Crop to the selected area
      const croppedImage = image.crop({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      });
      
      const pngBuffer = croppedImage.toPNG();
      fs.writeFileSync(filePath, pngBuffer);
      
      console.log(`✅ Area screenshot saved: ${filePath}`);
      return filePath;
    } else {
      // Capture full screen
      const filePath = path.join(picturesPath, `screenshot-full-native-${timestamp}.png`);
      
      console.log("📸 Capturing full screen");
      
      const pngBuffer = image.toPNG();
      fs.writeFileSync(filePath, pngBuffer);
      
      console.log(`✅ Full screen screenshot saved: ${filePath}`);
      return filePath;
    }
  } catch (err) {
    console.error("❌ Native screenshot failed:", err);
    throw err;
  }
}

// Capture to PNG buffer (no file write). Hides overlay during capture.
async function captureToBuffer(bounds) {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.hide();
    await new Promise(r => setTimeout(r, 120));
  }
  try {
    const { width, height } = screen.getPrimaryDisplay().bounds;
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } });
    if (!sources.length) throw new Error('No screen source');
    const baseImage = sources[0].thumbnail; // nativeImage
    const cropped = bounds
      ? baseImage.crop({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
      : baseImage;
    return cropped.toPNG();
  } finally {
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.show();
  }
}

// OCR using Tesseract.js
async function extractTextFromImageBuffer(pngBuffer) {
  const { data } = await Tesseract.recognize(pngBuffer, 'eng', { logger: () => {} });
  return (data && data.text) ? data.text.trim() : '';
}

// Ollama text generation
async function generateWithOllama(prompt) {
  try {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1:8b",
        messages: [
          { role: "system", content: "You are a helpful assistant that provides concise, clear explanations." },
          { role: "user", content: prompt }
        ],
        stream: false
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return `Ollama API error (${res.status}): ${errorText}`;
    }

    const data = await res.json();
    return data.message.content;
  } catch (err) {
    return `Failed to connect to Ollama: ${err.message}. Make sure Ollama is running on localhost:11434`;
  }
}

// Fallback capture method for Wayland
async function fallbackCapture(bounds) {
  try {
    console.log("🔄 Trying native screenshot as fallback...");
    return await nativeScreenshot(bounds);
  } catch (err) {
    console.error("❌ Native screenshot also failed:", err);
    throw err;
  }
}

// Handle getting screen sources
ipcMain.handle('overlay:get-screen-sources', async () => {
  try {
    console.log("🔍 Attempting to get screen sources...");
    const sources = await desktopCapturer.getSources({ 
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    console.log(`✅ Found ${sources.length} screen sources`);
    return sources;
  } catch (err) {
    console.error("❌ Error getting screen sources:", err);
    // Try alternative approach for Wayland
    try {
      console.log("🔄 Trying alternative screen capture method...");
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'],
        thumbnailSize: { width: 800, height: 600 }
      });
      console.log(`✅ Alternative method found ${sources.length} sources`);
      return sources;
    } catch (altErr) {
      console.error("❌ Alternative method also failed:", altErr);
      return [];
    }
  }
});

// Handle full screen capture
ipcMain.handle('overlay:capture-fullscreen', async (event, sourceId) => {
  try {
    console.log("📸 Capturing full screen...");
    
    // Temporarily hide the overlay to capture the content behind it
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.hide();
      // Wait a bit for the overlay to hide
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    try {
      // Use native screenshot method
      const result = await nativeScreenshot();
      
      // Show the overlay again
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.show();
      }
      
      return result;
    } catch (err) {
      // Show the overlay again even if screenshot failed
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.show();
      }
      throw err;
    }
  } catch (err) {
    console.error("❌ Error capturing full screen:", err);
    return null;
  }
});

// IPC: explain selected area - capture -> OCR -> Ollama
ipcMain.handle('overlay:explain-selection', async (event, bounds) => {
  try {
    const pngBuffer = await captureToBuffer(bounds);
    const text = await extractTextFromImageBuffer(pngBuffer);
    const enhancedPrompt = `You are an expert technical explainer.

Extracted text from a screenshot:
"""
${text}
"""

Task:
- Identify the context (UI, code, error, etc.)
- Provide a concise, beginner-friendly explanation
- List 3-5 key takeaways
- If it looks like code or error logs, include likely next steps.

Keep it short, clear, and formatted with bullet points.`;
    const answer = await generateWithOllama(enhancedPrompt);
    return { ocrText: text, answer };
  } catch (err) {
    console.error('❌ explain-selection failed:', err);
    return { ocrText: '', answer: `Failed: ${err.message}` };
  }
});

// IPC: ask AI freeform
ipcMain.handle('overlay:ask-ai', async (event, userPrompt) => {
  try {
    const answer = await generateWithOllama(userPrompt);
    return answer;
  } catch (err) {
    console.error('❌ ask-ai failed:', err);
    return `Failed: ${err.message}`;
  }
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
