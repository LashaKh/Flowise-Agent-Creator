/**
 * Auto-updater -- Checks for new versions via GitHub releases and installs them.
 *
 * How it works:
 * 1. On app launch, checks GitHub releases for a newer version
 * 2. If found, downloads the update silently in the background
 * 3. Notifies the renderer (UI) so it can show an "Update available" prompt
 * 4. When the user confirms, quits and installs the update
 *
 * Uses electron-updater which pairs with the electron-builder "publish" config.
 */
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
type UpdateInfo = { version: string };
import { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function initAutoUpdater(win: BrowserWindow) {
  mainWindow = win;

  // Don't bother checking in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Auto-updater: skipped in development');
    return;
  }

  // Silent download -- don't auto-install, let the user choose when to restart
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('updater:status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    sendToRenderer('updater:status', {
      status: 'available',
      version: info.version,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('updater:status', { status: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('updater:status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    sendToRenderer('updater:status', {
      status: 'ready',
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    sendToRenderer('updater:status', {
      status: 'error',
      error: err.message,
    });
  });

  // Check for updates after a short delay so the app loads first
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently fail -- user can manually check later
    });
  }, 5000);
}

/**
 * Manually trigger an update check (called from Settings page).
 */
export function checkForUpdates() {
  return autoUpdater.checkForUpdates();
}

/**
 * Quit and install the downloaded update.
 */
export function installUpdate() {
  autoUpdater.quitAndInstall();
}

function sendToRenderer(channel: string, data: unknown) {
  mainWindow?.webContents.send(channel, data);
}
