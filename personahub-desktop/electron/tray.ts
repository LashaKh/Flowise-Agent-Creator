/**
 * System Tray — The little icon that sits in your menu bar / system tray.
 * Click it to open the app. Right-click for a menu.
 */
import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

export function initTray(mainWindow: BrowserWindow) {
  // Create a small icon (16x16 on macOS, 32x32 on Windows/Linux)
  const iconPath = path.join(__dirname, '../public/tray-icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Fallback: create a simple colored square
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
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
}

export function destroyTray() {
  tray?.destroy();
  tray = null;
}
