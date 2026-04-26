/**
 * System Tray — The little icon that sits in your menu bar / system tray.
 * Click it to open the app. Right-click for a menu.
 */
import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray: Tray | null = null;

/**
 * Initialize the system tray. Returns true on success, false if the tray
 * couldn't be created (missing icon, OS rejection). Callers should fall
 * back to "close = quit" behavior when this returns false, so the user
 * isn't stranded with a hidden window they can't restore.
 */
export function initTray(mainWindow: BrowserWindow): boolean {
  // Prefer .ico on Windows (multi-res, crisp on high-DPI); PNG elsewhere.
  // `new Tray(emptyImage)` throws on Windows — a missing icon must NOT crash
  // boot. On any failure we log and return false so main.ts can adjust
  // the close-button behavior.
  const iconFile = process.platform === 'win32' ? 'tray-icon.ico' : 'tray-icon.png';
  const iconPath = path.join(__dirname, '../public', iconFile);
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      console.warn(`[tray] Icon at ${iconPath} loaded empty; skipping tray.`);
      return false;
    }
  } catch (err) {
    console.warn('[tray] Failed to load icon, skipping tray:', err);
    return false;
  }

  try {
    tray = new Tray(icon);
  } catch (err) {
    console.warn('[tray] Tray constructor failed, skipping tray:', err);
    tray = null;
    return false;
  }
  tray.setToolTip('PersonaHub Desktop');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Chat',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('navigate', 'settings');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as typeof app & { isQuitting: boolean }).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click tray icon to toggle window
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return true;
}

/**
 * Returns true if the tray was successfully initialized and is currently
 * active. Use this to decide whether to hide-on-close or quit-on-close.
 */
export function isTrayActive(): boolean {
  return tray !== null;
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}
