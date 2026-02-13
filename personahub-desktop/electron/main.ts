import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { initTray } from './tray';
import { handleAuthCallback, getAuthState, refreshToken, logout } from './auth';
import { getToken, storeToken, clearToken } from './secure-store';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import { initAutoUpdater, checkForUpdates, installUpdate } from './updater';

// Database
import { initDatabase, closeDatabase, getDatabase } from '../db/init';

// Security
import { evaluateAction } from '../security/action-guard';
import { savePermission } from '../security/permission-memory';
import { undo } from '../security/backup-manager';

// Agent bridge
import {
  sendMessage as agentSendMessage,
  startAgent,
  stopAgent,
  stopAllAgents,
  onResponse,
  onToolCall,
  initAgentBridge,
} from '../openclaw/agent-bridge';

// Sync
import { syncPersonas } from '../sync/platform-sync';

// OpenClaw runtime manager
import {
  checkInstallation,
  installRuntime,
  writeConfig,
  startGateway,
  waitForReady,
  stopGateway,
} from './openclaw-manager';

import type { ActionRequest, ConfirmationResponse } from '../src/types';

// Single instance lock — only one copy of the app can run
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const PROTOCOL = 'personahub';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // In dev, load from Vite dev server; in prod, load built files
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Minimize to tray instead of closing (overridden in Phase 8)
  mainWindow.on('close', (e) => {
    if (!(app as typeof app & { isQuitting?: boolean }).isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

// Register custom protocol for OAuth callback
function registerProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]!),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

// Handle deep link URLs (personahub://auth/callback?code=xxx)
function handleDeepLink(url: string) {
  if (url.startsWith(`${PROTOCOL}://auth/callback`)) {
    handleAuthCallback(url).then((result) => {
      mainWindow?.webContents.send('auth:callback', result);
    });
  }
}

// ─── IPC Handlers ──────────────────────────────────

function setupIPC() {
  // Auth
  ipcMain.handle('auth:getState', () => getAuthState());
  ipcMain.handle('auth:refresh', () => refreshToken());
  ipcMain.handle('auth:logout', () => logout());
  ipcMain.handle('auth:getToken', () => getToken());
  ipcMain.handle('auth:storeToken', (_e, token: string) => storeToken(token));
  ipcMain.handle('auth:clearToken', () => clearToken());

  // Window control
  ipcMain.handle('window:show', () => mainWindow?.show());
  ipcMain.handle('window:hide', () => mainWindow?.hide());
  ipcMain.handle('window:isVisible', () => mainWindow?.isVisible());

  // App info
  ipcMain.handle('app:getPath', (_e, name: string) =>
    app.getPath(name as Parameters<typeof app.getPath>[0])
  );
  ipcMain.handle('app:getVersion', () => app.getVersion());

  // Auto-updater
  ipcMain.handle('updater:check', () => checkForUpdates());
  ipcMain.handle('updater:install', () => installUpdate());

  // ─── Security ─────────────────────────────────
  ipcMain.handle('security:evaluate', (_e, request: ActionRequest) => {
    const persona = getDatabase().getPersonaById(request.personaId);
    if (!persona) throw new Error(`Persona ${request.personaId} not found`);
    return evaluateAction(request, persona);
  });

  ipcMain.handle('security:confirm', (_e, requestId: string, response: ConfirmationResponse) => {
    if (response.decision === 'allow_always' && 'pathPattern' in response) {
      savePermission({
        personaId: requestId,
        tool: '',
        pathPattern: response.pathPattern,
        permission: 'allow_always',
      });
    } else if (response.decision === 'block') {
      savePermission({
        personaId: requestId,
        tool: '',
        pathPattern: '',
        permission: 'block_always',
      });
    }
  });

  // ─── Agent ────────────────────────────────────
  ipcMain.handle('agent:send', async (_e, personaId: string, message: string) => {
    const persona = getDatabase().getPersonaById(personaId);
    if (!persona) throw new Error(`Persona ${personaId} not found`);
    await startAgent(persona);
    await agentSendMessage(personaId, message, persona);
  });

  ipcMain.handle('agent:stop', (_e, personaId: string) => {
    return stopAgent(personaId);
  });

  // ─── Sync ─────────────────────────────────────
  ipcMain.handle('sync:now', async () => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    return syncPersonas(token);
  });

  // ─── Backup ───────────────────────────────────
  ipcMain.handle('backup:undo', (_e, backupId: string) => {
    return undo(backupId);
  });

  ipcMain.handle('backup:history', (_e, personaId?: string) => {
    if (personaId) {
      return getDatabase().getActionLogsByPersona(personaId);
    }
    return getDatabase().getAllActionLogs();
  });

  // ─── OpenClaw ─────────────────────────────────
  ipcMain.handle('openclaw:checkInstalled', () => {
    return checkInstallation();
  });

  ipcMain.handle('openclaw:install', async (_e, apiKey: string, provider: string) => {
    // Install runtime with progress forwarded to renderer
    await installRuntime((pct) => {
      mainWindow?.webContents.send('openclaw:progress', pct);
    });

    // Write config with the user's API key
    writeConfig(apiKey, provider as 'anthropic' | 'google');

    // Start the gateway
    await startGateway();
    const ready = await waitForReady();
    if (!ready) throw new Error('Gateway failed to start within 30 seconds');

    // Initialize the agent bridge WebSocket connection
    initAgentBridge();
  });
}

// ─── App Lifecycle ──────────────────────────────────

app.whenReady().then(() => {
  // Initialize database first — everything else depends on it
  initDatabase(app.getPath('userData'));

  registerProtocol();
  setupIPC();
  createWindow();
  initTray(mainWindow!);
  registerShortcuts(mainWindow!);
  initAutoUpdater(mainWindow!);

  // Forward agent events to the renderer process
  onResponse((chunk) => mainWindow?.webContents.send('agent:response', chunk));
  onToolCall((toolCall) => mainWindow?.webContents.send('agent:toolCall', toolCall));

  // Start on login — defaults to true, user can toggle in Settings
  app.setLoginItemSettings({ openAtLogin: true });
});

// macOS: re-create window when dock icon clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

// Handle deep links on macOS
app.on('open-url', (_event, url) => {
  handleDeepLink(url);
});

// Handle deep links on Windows/Linux (second instance)
app.on('second-instance', (_event, commandLine) => {
  const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
  if (url) handleDeepLink(url);
  mainWindow?.show();
});

app.on('before-quit', async () => {
  (app as typeof app & { isQuitting: boolean }).isQuitting = true;
  unregisterShortcuts();

  // Stop all running agents and the gateway
  await stopAllAgents();
  stopGateway();

  // Close the database connection
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

export { mainWindow };
