/**
 * IPC sender validation — ensures requests come from our main window only.
 * Think of this as a bouncer checking IDs: only the real app window gets through.
 */
import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

let _mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  _mainWindow = win;
}

/**
 * Verify the IPC event came from our main window's main frame.
 * Returns true if valid, false if the sender is suspicious.
 */
export function validateSender(event: IpcMainInvokeEvent): boolean {
  if (!event.senderFrame || !_mainWindow) return false;
  if (event.senderFrame !== _mainWindow.webContents.mainFrame) return false;

  const url = new URL(event.senderFrame.url);
  return (
    (url.protocol === 'http:' && url.hostname === 'localhost') || // dev
    url.protocol === 'file:'                                       // prod
  );
}

/**
 * Register an IPC handler that automatically validates the sender.
 * Use this instead of `ipcMain.handle(...)` for every new IPC handler.
 *
 * The listener receives the `IpcMainInvokeEvent` as its first argument so
 * handlers that need frame info still have access to it (same signature as
 * `ipcMain.handle`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleValidated<A extends any[], R>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: A) => R | Promise<R>,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!validateSender(event)) throw new Error('Unauthorized sender');
    return fn(event, ...(args as A));
  });
}
