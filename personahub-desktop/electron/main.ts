import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { initTray } from './tray';
import { handleAuthCallback, getAuthState, refreshToken, logout, signInWithPassword } from './auth';
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

import { generatePrompt } from './openclaw-client';
import { removeAgentConfig } from '../openclaw/config-factory';
import { convertDocument } from '../openclaw/document-converter';
import type { ActionRequest, ConfirmationResponse, ConfirmationLevel, PersonaConfig, PersonaSettings, KnowledgeDocument } from '../src/types';

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
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // In dev, load from Vite dev server; in prod, load built files
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
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
  ipcMain.handle('auth:signIn', (_e, email: string, password: string) => signInWithPassword(email, password));
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

  // ─── Persona Creation (AI-powered) ────────────
  ipcMain.handle('persona:create', async (
    _e,
    name: string,
    description: string,
    options?: { temperature?: number; confirmationLevel?: ConfirmationLevel }
  ) => {
    // 1. Ask the AI to generate a rich system prompt from the name + description
    const systemPrompt = await generatePrompt(name, description);

    // 2. Insert persona into SQLite
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const confirmationLevel = options?.confirmationLevel ?? 'balanced';

    const db = getDatabase();
    const defaultTools = JSON.stringify(['read', 'ls', 'web_search', 'web_fetch']);
    const defaultPaths = JSON.stringify([{ path: '~/', mode: 'read' }]);

    db.db.prepare(
      `INSERT INTO persona_configs (id, name, system_prompt, status, confirmation_level, enabled_tools, allowed_paths, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, systemPrompt, 'active', confirmationLevel, defaultTools, defaultPaths, now, now);

    // 3. Start the agent (writes SOUL.md + registers with OpenClaw)
    const persona = db.getPersonaById(id);
    if (persona) {
      await startAgent(persona);
    }

    return { id, name, systemPrompt };
  });

  // ─── Persona Management ─────────────────────
  ipcMain.handle('persona:list', () => {
    return getDatabase().getActivePersonas();
  });

  ipcMain.handle('persona:get', (_e, id: string) => {
    return getDatabase().getPersonaById(id) ?? null;
  });

  ipcMain.handle('persona:update', async (
    _e,
    id: string,
    updates: Partial<Pick<PersonaConfig, 'name' | 'systemPrompt' | 'confirmationLevel' | 'enabledTools' | 'allowedPaths'> & { settings: Partial<PersonaSettings> }>
  ) => {
    const db = getDatabase();
    const persona = db.getPersonaById(id);
    if (!persona) throw new Error(`Persona ${id} not found`);

    // Merge updates
    if (updates.name !== undefined) persona.name = updates.name;
    if (updates.systemPrompt !== undefined) persona.systemPrompt = updates.systemPrompt;
    if (updates.confirmationLevel !== undefined) persona.confirmationLevel = updates.confirmationLevel;
    if (updates.enabledTools !== undefined) persona.enabledTools = updates.enabledTools;
    if (updates.allowedPaths !== undefined) persona.allowedPaths = updates.allowedPaths;
    if (updates.settings) persona.settings = { ...persona.settings, ...updates.settings };
    persona.updatedAt = new Date().toISOString();

    db.upsertPersona(persona);

    // Re-write SOUL.md if anything that affects agent config changed
    if (updates.systemPrompt !== undefined || updates.name !== undefined || updates.enabledTools !== undefined || updates.allowedPaths !== undefined) {
      await startAgent(persona);
    }

    return persona;
  });

  ipcMain.handle('persona:delete', async (_e, id: string) => {
    const db = getDatabase();
    const persona = db.getPersonaById(id);
    if (!persona) throw new Error(`Persona ${id} not found`);

    // Stop agent + remove config files
    await stopAgent(id);
    removeAgentConfig(id);

    // Delete chat history
    db.db.prepare(`DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE persona_id = ?)`).run(id);
    db.db.prepare(`DELETE FROM chat_sessions WHERE persona_id = ?`).run(id);

    // Delete persona
    db.deletePersona(id);
  });

  ipcMain.handle('persona:duplicate', async (_e, id: string) => {
    const db = getDatabase();
    const original = db.getPersonaById(id);
    if (!original) throw new Error(`Persona ${id} not found`);

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const clone: PersonaConfig = {
      ...original,
      id: newId,
      name: `Copy of ${original.name}`,
      createdAt: now,
      updatedAt: now,
    };

    db.upsertPersona(clone);
    await startAgent(clone);

    return { id: newId, name: clone.name };
  });

  ipcMain.handle('persona:regeneratePrompt', async (_e, id: string) => {
    const db = getDatabase();
    const persona = db.getPersonaById(id);
    if (!persona) throw new Error(`Persona ${id} not found`);

    const systemPrompt = await generatePrompt(persona.name, persona.systemPrompt.slice(0, 200));
    persona.systemPrompt = systemPrompt;
    persona.updatedAt = new Date().toISOString();
    db.upsertPersona(persona);
    await startAgent(persona);

    return { systemPrompt };
  });

  ipcMain.handle('persona:clearHistory', (_e, personaId: string) => {
    const db = getDatabase();
    db.db.prepare(`DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE persona_id = ?)`).run(personaId);
    db.db.prepare(`DELETE FROM chat_sessions WHERE persona_id = ?`).run(personaId);
  });

  ipcMain.handle('persona:export', (_e, id: string) => {
    const db = getDatabase();
    const persona = db.getPersonaById(id);
    if (!persona) throw new Error(`Persona ${id} not found`);

    // Export only the essential fields (no internal IDs)
    const exportData = {
      name: persona.name,
      systemPrompt: persona.systemPrompt,
      confirmationLevel: persona.confirmationLevel,
      settings: persona.settings,
      enabledTools: persona.enabledTools,
      allowedPaths: persona.allowedPaths,
      blockedPaths: persona.blockedPaths,
    };
    return JSON.stringify(exportData, null, 2);
  });

  ipcMain.handle('persona:import', async (_e, json: string) => {
    const data = JSON.parse(json);
    if (!data.name || !data.systemPrompt) throw new Error('Invalid persona data');

    const db = getDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const persona: PersonaConfig = {
      id,
      userId: '',
      name: data.name,
      systemPrompt: data.systemPrompt,
      chatflowId: '',
      apiEndpoint: '',
      status: 'active',
      enabledTools: data.enabledTools ?? [],
      allowedPaths: data.allowedPaths ?? [],
      blockedPaths: data.blockedPaths ?? [],
      confirmationLevel: data.confirmationLevel ?? 'balanced',
      dangerousToolsEnabled: false,
      activityLogging: true,
      undoEnabled: true,
      sandboxEnabled: false,
      knowledgeBaseRefs: [],
      settings: data.settings ?? {},
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    db.upsertPersona(persona);
    await startAgent(persona);

    return { id, name: persona.name };
  });

  ipcMain.handle('persona:stats', (_e, personaId: string) => {
    const db = getDatabase();
    const row = db.db.prepare(`
      SELECT COUNT(*) as count, MAX(cm.created_at) as last_active
      FROM chat_messages cm
      JOIN chat_sessions cs ON cm.session_id = cs.id
      WHERE cs.persona_id = ?
    `).get(personaId) as { count: number; last_active: string | null } | undefined;

    return {
      messageCount: row?.count ?? 0,
      lastActiveAt: row?.last_active ?? null,
    };
  });

  // ─── Knowledge Base ─────────────────────────────
  ipcMain.handle('kb:upload', async (_e, personaId: string) => {
    // Open native file picker (sandbox blocks file.path in renderer)
    const result = await dialog.showOpenDialog({
      title: 'Upload Knowledge Document',
      filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0]!;

    const db = getDatabase();
    const persona = db.getPersonaById(personaId);
    if (!persona) throw new Error(`Persona ${personaId} not found`);

    // Convert the file to plain text
    const { text, title } = await convertDocument(filePath);

    // Write as .md into the agent's knowledge folder
    const knowledgeDir = path.join(os.homedir(), '.openclaw', 'agents', personaId, 'knowledge');
    fs.mkdirSync(knowledgeDir, { recursive: true });
    const mdFileName = `${title}.md`;
    const mdPath = path.join(knowledgeDir, mdFileName);
    fs.writeFileSync(mdPath, text, 'utf-8');

    // Get original file info
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '') as KnowledgeDocument['fileType'];

    // Insert DB record
    const doc: KnowledgeDocument = {
      id: crypto.randomUUID(),
      personaId,
      title,
      fileName: path.basename(filePath),
      fileType: ext,
      fileSize: stat.size,
      workspacePath: mdPath,
      createdAt: new Date().toISOString(),
    };
    db.insertKnowledgeDoc(doc);

    return doc;
  });

  ipcMain.handle('kb:list', (_e, personaId: string) => {
    return getDatabase().getKnowledgeDocs(personaId);
  });

  ipcMain.handle('kb:delete', (_e, docId: string) => {
    const db = getDatabase();
    const doc = db.deleteKnowledgeDoc(docId);
    if (doc && fs.existsSync(doc.workspacePath)) {
      fs.unlinkSync(doc.workspacePath);
    }
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
  ipcMain.handle('openclaw:checkInstalled', async () => {
    const result = await checkInstallation();
    console.log('[IPC] openclaw:checkInstalled =>', result);
    return result;
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

app.whenReady().then(async () => {
  // Initialize database first — everything else depends on it
  initDatabase(app.getPath('userData'));

  // Backfill: give existing personas default tools if they have none
  {
    const db = getDatabase();
    const defaultTools = JSON.stringify(['read', 'ls', 'web_search', 'web_fetch']);
    const defaultPaths = JSON.stringify([{ path: '~/', mode: 'read' }]);
    db.db.prepare(
      `UPDATE persona_configs SET enabled_tools = ?, allowed_paths = ? WHERE enabled_tools IS NULL OR enabled_tools = '[]'`
    ).run(defaultTools, defaultPaths);
  }

  registerProtocol();
  setupIPC();

  // Auto-start gateway if OpenClaw is already installed and configured
  const installed = await checkInstallation();
  console.log('[main] checkInstallation:', installed);
  if (installed) {
    try {
      await startGateway();
      const ready = await waitForReady();
      console.log('[main] gateway ready:', ready);
      if (ready) initAgentBridge();
    } catch (err) {
      console.error('[main] Failed to auto-start gateway:', err);
    }
  }

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
