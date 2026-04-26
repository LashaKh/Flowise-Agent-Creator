/**
 * Global Keyboard Shortcuts
 *
 * Registers a system-wide hotkey that brings the chat window to the
 * foreground (or hides it if already visible). The accelerator string is
 * dynamic — it comes from user preferences and can be changed from the
 * Settings panel without a restart via `updateShortcut()`.
 */
import { globalShortcut, BrowserWindow } from 'electron';

export const DEFAULT_SHORTCUT = 'CmdOrCtrl+Shift+P';

// Track the currently-registered accelerator so updateShortcut() can
// unregister it before swapping.
let currentShortcut: string | null = null;
let currentWindow: BrowserWindow | null = null;

function toggleWindow(win: BrowserWindow) {
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

/**
 * Register the shortcut. Returns true on success, false if Electron rejected
 * the accelerator (e.g. malformed string or conflict with another app).
 */
export function registerShortcuts(
  mainWindow: BrowserWindow,
  accelerator: string = DEFAULT_SHORTCUT,
): boolean {
  currentWindow = mainWindow;
  try {
    const ok = globalShortcut.register(accelerator, () => toggleWindow(mainWindow));
    if (ok) {
      currentShortcut = accelerator;
      return true;
    }
    console.warn('[shortcuts] Failed to register accelerator:', accelerator);
    return false;
  } catch (err) {
    console.warn('[shortcuts] Register threw — likely a malformed accelerator:', accelerator, err);
    return false;
  }
}

/**
 * Swap the active shortcut at runtime. Used when the user changes the hotkey
 * in Settings — no app restart required.
 *
 * Returns true on success, false if registration failed (in which case the
 * OLD shortcut is re-registered as a fallback so the user isn't left without
 * any hotkey).
 */
export function updateShortcut(accelerator: string): boolean {
  if (!currentWindow) return false;
  if (accelerator === currentShortcut) return true;

  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut);
  }

  const ok = registerShortcuts(currentWindow, accelerator);
  if (!ok && currentShortcut && currentShortcut !== accelerator) {
    // Fallback: put the old one back so the app remains reachable.
    registerShortcuts(currentWindow, currentShortcut);
  }
  return ok;
}

export function unregisterShortcuts() {
  globalShortcut.unregisterAll();
  currentShortcut = null;
  currentWindow = null;
}
