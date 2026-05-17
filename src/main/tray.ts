import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import { sendNow as sendRemindersNow } from './email';

let tray: Tray | null = null;

const buildTrayIcon = () => {
  // Try a packaged icon first; fall back to an empty image so the app still runs.
  const candidates = [
    path.join(process.resourcesPath ?? '', 'tray-icon.png'),
    path.join(app.getAppPath(), 'build', 'tray-icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
  ];
  for (const p of candidates) {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      // macOS template-image rendering for crisp menu bar look.
      if (process.platform === 'darwin') img.setTemplateImage(true);
      return img;
    }
  }
  return nativeImage.createEmpty();
};

export const initTray = (getWindow: () => BrowserWindow | null) => {
  if (tray) return tray;
  tray = new Tray(buildTrayIcon());
  tray.setToolTip('PolicyHub');

  const refresh = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show window',
        click: () => {
          const win = getWindow();
          if (win) {
            win.show();
            win.focus();
          }
        },
      },
      {
        label: 'Send pending reminders now',
        click: async () => {
          try {
            await sendRemindersNow();
          } catch (err) {
            console.error('[tray] send-now failed', err);
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit PolicyHub',
        click: () => {
          (app as any).isQuiting = true;
          app.quit();
        },
      },
    ]);
    tray!.setContextMenu(menu);
  };

  tray.on('click', () => {
    const win = getWindow();
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  refresh();
  return tray;
};
