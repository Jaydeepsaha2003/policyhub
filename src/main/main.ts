import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { getDb } from './db';
import { registerIpc } from './ipc';
import { initTray } from './tray';
import { startScheduler, stopScheduler } from './scheduler';
import { readSettings } from './repo/settings';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  const preloadPath = path.join(__dirname, '..', 'preload', 'preload.js');
  console.log('[main] resolved preload path:', preloadPath);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('node:fs').accessSync(preloadPath);
    console.log('[main] preload file exists');
  } catch (err) {
    console.error('[main] PRELOAD FILE NOT FOUND at', preloadPath, err);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0b0f',
    title: 'PolicyHub',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Surface preload errors and renderer console messages to the main terminal.
  mainWindow.webContents.on('preload-error', (_ev, p, err) => {
    console.error('[main] PRELOAD ERROR in', p, '->', err);
  });
  mainWindow.webContents.on('console-message', (_ev, level, message, line, source) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    console.log(`[renderer:${levels[level] ?? level}] ${message}  (${source}:${line})`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // External links open in user's browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Close button hides the window instead of quitting.
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuiting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // From dist-electron/main/main.js → ../../dist/index.html
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
};

// Single instance lock — second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  // Touch the DB so the file is created and schema applied on first run.
  getDb();
  registerIpc();
  createWindow();
  initTray(() => mainWindow);
  startScheduler();

  // Sync login-item setting with what's stored.
  try {
    const s = readSettings();
    app.setLoginItemSettings({ openAtLogin: !!s.startAtLogin });
  } catch (err) {
    console.error('[main] settings sync failed', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

// Don't quit on all-windows-closed — the window is hidden, not closed,
// so this rarely fires; we simply stay alive so the tray and scheduler keep running.
app.on('window-all-closed', () => {
  // intentionally empty
});

let _syncOnQuitRunning = false;

app.on('before-quit', async (event) => {
  // Only attempt the sync once per quit cycle.
  if (_syncOnQuitRunning) return;

  try {
    // Lazy-require so the dependency graph stays simple and a failed import
    // never blocks quit.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const settingsModule = require('./repo/settings') as typeof import('./repo/settings');
    const s = settingsModule.readSettings();
    if (s.cloudSyncOnQuit && s.cloudSheetUrl && s.cloudSheetSecretSet) {
      event.preventDefault();
      _syncOnQuitRunning = true;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { syncToSheet } = require('./cloud-sync') as typeof import('./cloud-sync');

      // Best-effort with 15s timeout.
      const result = await Promise.race([
        syncToSheet(),
        new Promise<{ ok: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ ok: false, error: 'timeout' }), 15_000),
        ),
      ]);
      console.log('[quit] cloud sync result', result);
      (app as any).isQuiting = true;
      stopScheduler();
      app.quit();
      return;
    }
  } catch (err) {
    console.error('[quit] sync-on-quit failed', err);
  }

  (app as any).isQuiting = true;
  stopScheduler();
});
