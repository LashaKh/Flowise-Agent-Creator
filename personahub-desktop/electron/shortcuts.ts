/**
 * Global Keyboard Shortcuts
 * CmdOrCtrl+Shift+P opens/focuses the chat window from any app
 */
import { globalShortcut, BrowserWindow } from 'electron';

const DEFAULT_SHORTCUT = 'CmdOrCtrl+Shift+P';

export function registerShortcuts(mainWindow: BrowserWindow) {
  globalShortcut.register(DEFAULT_SHORTCUT, () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

export function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}
