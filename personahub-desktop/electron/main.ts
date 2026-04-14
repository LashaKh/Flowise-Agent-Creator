import { app, BrowserWindow, dialog, session, powerMonitor } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initTray, destroyTray } from './tray';
import { handleAuthCallback, getAuthState, refreshToken, logout, signInWithPassword } from './auth';
import { getToken, storeToken, clearToken } from './secure-store';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import { initAutoUpdater, checkForUpdates, installUpdate } from './updater';
import { handleValidated, setMainWindow } from './ipc-validation';
import {
  generateSpeech,
  transcribeAudio,
  generatePrompt,
  disconnect as disconnectGatewayWS,
} from './openclaw-client';
import { storeVoiceKey, getVoiceKey, deleteVoiceKey } from './voice-key-store';
import { getMonthlySummary as getLlmMonthlySummary } from './llm-usage-log';

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
  setActionGuard,
  setPersonaLookup,
} from '../openclaw/agent-bridge';

// OpenClaw runtime manager
import {
  checkInstallation,
  writeConfig,
  refreshConfigToken,
  startGateway,
  waitForReady,
  stopGateway,
  cleanupOldRuntime,
  tryAutoBootstrapFromEnv,
  getConfiguredProvider,
  getConfiguredKeyPreview,
} from './openclaw-manager';

// Platform sync
import { syncPersonas } from '../sync/platform-sync';

import { removeAgentConfig } from '../openclaw/config-factory';
import { convertDocument } from '../openclaw/document-converter';
import type {
  ActionRequest,
  ConfirmationResponse,
  ConfirmationLevel,
  PersonaConfig,
  PersonaSettings,
  KnowledgeDocument,
} from '../src/types';

// Module-level quit flag. Set to true in `before-quit` so the window's
// `close` handler knows to let the window actually close (instead of just
// hiding it to the tray).
let isQuitting = false;

// ─── Single instance lock ──────────────────────────
// Skipped in dev mode because vite-plugin-electron's rapid restart cycle
// can leave stale lock state that prevents subsequent launches.
const isDevMode = !!process.env.VITE_DEV_SERVER_URL;
if (!isDevMode) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  }
}

let mainWindow: BrowserWindow | null = null;

const PROTOCOL = 'personahub';

// ─── Window creation ───────────────────────────────

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

  setMainWindow(mainWindow);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Hide instead of closing — app stays alive in the tray.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

function registerProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2 && process.argv[1]) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function handleDeepLink(url: string) {
  if (url.startsWith(`${PROTOCOL}://auth/callback`)) {
    handleAuthCallback(url).then((result) => {
      mainWindow?.webContents.send('auth:callback', result);
    });
  }
}

// ─── Security wiring (agent bridge + ActionGuard) ──

let securityWired = false;
function wireSecurityLayer() {
  if (securityWired) return;
  setActionGuard(async (req, persona) => evaluateAction(req, persona));
  setPersonaLookup((personaId) => {
    try {
      return getDatabase().getPersonaById(personaId) ?? null;
    } catch (err) {
      console.error('[main] personaLookup failed:', err);
      return null;
    }
  });
  securityWired = true;
}

// ─── IPC Handlers ──────────────────────────────────

function setupIPC() {
  // ─── Auth ───────────────────────────────────
  handleValidated('auth:getState', () => getAuthState());
  handleValidated('auth:signIn', (_e, email: string, password: string) =>
    signInWithPassword(email, password));
  handleValidated('auth:refresh', () => refreshToken());
  handleValidated('auth:logout', () => logout());
  handleValidated('auth:getToken', () => getToken());
  handleValidated('auth:storeToken', (_e, token: string) => storeToken(token));
  handleValidated('auth:clearToken', () => clearToken());

  // ─── Window ─────────────────────────────────
  handleValidated('window:show', () => mainWindow?.show());
  handleValidated('window:hide', () => mainWindow?.hide());
  handleValidated('window:isVisible', () => mainWindow?.isVisible());

  // ─── App info ───────────────────────────────
  handleValidated('app:getPath', (_e, name: string) => {
    // Only allow paths the renderer legitimately needs — prevents snooping
    // around the filesystem via IPC.
    const ALLOWED = new Set(['userData']);
    if (!ALLOWED.has(name)) throw new Error(`Disallowed path: ${name}`);
    return app.getPath(name as Parameters<typeof app.getPath>[0]);
  });
  handleValidated('app:getVersion', () => app.getVersion());

  // ─── Auto-updater ───────────────────────────
  handleValidated('updater:check', () => checkForUpdates());
  handleValidated('updater:install', () => installUpdate());

  // ─── Security ───────────────────────────────
  // Remember the original request so security:confirm can save the right
  // permission record after user approval.
  const pendingRequests = new Map<string, { personaId: string; tool: string; target?: string }>();

  handleValidated('security:evaluate', (_e, request: ActionRequest & { requestId?: string }) => {
    const persona = getDatabase().getPersonaById(request.personaId);
    if (!persona) throw new Error(`Persona ${request.personaId} not found`);
    if (request.requestId) {
      pendingRequests.set(request.requestId, {
        personaId: request.personaId,
        tool: request.tool,
        target: request.target,
      });
    }
    return evaluateAction(request, persona);
  });

  handleValidated('security:confirm', (_e, requestId: string, response: ConfirmationResponse) => {
    const orig = pendingRequests.get(requestId);
    if (!orig) {
      console.warn('[security:confirm] Unknown requestId:', requestId);
      return;
    }
    if (response.decision === 'allow_always' && 'pathPattern' in response) {
      savePermission({
        personaId: orig.personaId,
        tool: orig.tool,
        pathPattern: response.pathPattern,
        permission: 'allow_always',
      });
    } else if (response.decision === 'block') {
      savePermission({
        personaId: orig.personaId,
        tool: orig.tool,
        pathPattern: orig.target ?? '',
        permission: 'block_always',
      });
    }
    pendingRequests.delete(requestId);
  });

  // ─── Agent ──────────────────────────────────
  handleValidated('agent:send', async (_e, personaId: string, message: string) => {
    const persona = getDatabase().getPersonaById(personaId);
    if (!persona) throw new Error(`Persona ${personaId} not found`);
    await startAgent(persona);
    await agentSendMessage(personaId, message, persona);
  });

  handleValidated('agent:stop', (_e, personaId: string) => {
    return stopAgent(personaId);
  });

  // ─── Persona Creation (AI-powered) ──────────
  handleValidated('persona:create', async (
    _e,
    name: string,
    description: string,
    options?: { temperature?: number; confirmationLevel?: ConfirmationLevel; modelName?: string }
  ) => {
    const systemPrompt = await generatePrompt(name, description);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const confirmationLevel = options?.confirmationLevel ?? 'balanced';
    const db = getDatabase();
    const defaultTools = JSON.stringify(['read', 'ls', 'web_search', 'web_fetch']);
    const defaultPaths = JSON.stringify([{ path: '~/', mode: 'read' }]);

    // Seed settings from create options so new personas inherit the global
    // default-model preference set in Settings.
    const settingsBlob: Record<string, unknown> = {};
    if (options?.temperature !== undefined) settingsBlob.temperature = options.temperature;
    if (options?.modelName) settingsBlob.modelName = options.modelName;
    const settingsJson = JSON.stringify(settingsBlob);

    db.db.prepare(
      `INSERT INTO persona_configs (id, name, system_prompt, status, confirmation_level, enabled_tools, allowed_paths, settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, systemPrompt, 'active', confirmationLevel, defaultTools, defaultPaths, settingsJson, now, now);

    const persona = db.getPersonaById(id);
    if (persona) {
      await startAgent(persona);
    }
    return { id, name, systemPrompt };
  });

  // ─── Persona Management ─────────────────────
  handleValidated('persona:list', () => {
    return getDatabase().getActivePersonas();
  });

  handleValidated('persona:get', (_e, id: string) => {
    return getDatabase().getPersonaById(id) ?? null;
  });

  handleValidated('persona:update', async (
    _e,
    id: string,
    updates: Partial<Pick<PersonaConfig, 'name' | 'systemPrompt' | 'confirmationLevel' | 'enabledTools' | 'allowedPaths'> & { settings: Partial<PersonaSettings> }>
  ) => {
    const db = getDatabase();
    const persona = db.getPersonaById(id);
    if (!persona) throw new Error(`Persona ${id} not found`);

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

  handleValidated('persona:delete', async (_e, id: string) => {
    const db = getDatabase();
    const persona = db.getPersonaById(id);
    if (!persona) throw new Error(`Persona ${id} not found`);

    await stopAgent(id);
    removeAgentConfig(id);

    db.db.transaction(() => {
      db.db.prepare('DELETE FROM knowledge_documents WHERE persona_id = ?').run(id);
      db.db.prepare('DELETE FROM permission_memory WHERE persona_id = ?').run(id);
      db.db.prepare(`DELETE FROM backup_records WHERE action_log_id IN
        (SELECT id FROM action_log_entries WHERE persona_id = ?)`).run(id);
      db.db.prepare('DELETE FROM action_log_entries WHERE persona_id = ?').run(id);
      db.db.prepare(`DELETE FROM chat_messages WHERE session_id IN
        (SELECT id FROM chat_sessions WHERE persona_id = ?)`).run(id);
      db.db.prepare('DELETE FROM chat_sessions WHERE persona_id = ?').run(id);
      db.db.prepare('DELETE FROM persona_configs WHERE id = ?').run(id);
    })();
  });

  handleValidated('persona:duplicate', async (_e, id: string) => {
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

  handleValidated('persona:regeneratePrompt', async (_e, id: string) => {
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

  handleValidated('persona:clearHistory', (_e, personaId: string) => {
    const db = getDatabase();
    db.db.transaction(() => {
      db.db.prepare('DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE persona_id = ?)').run(personaId);
      db.db.prepare('DELETE FROM chat_sessions WHERE persona_id = ?').run(personaId);
    })();
  });

  handleValidated('persona:export', (_e, id: string) => {
    const db = getDatabase();
    const persona = db.getPersonaById(id);
    if (!persona) throw new Error(`Persona ${id} not found`);

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

  handleValidated('persona:import', async (_e, json: string) => {
    // Never blindly trust a JSON file — sanitize name, whitelist tools,
    // and force conservative defaults. User can broaden later via UI.
    const SAFE_TOOL_WHITELIST = new Set([
      'read',
      'ls',
      'web_search',
      'web_fetch',
      'memory_search',
      'calendar.read',
      'weather',
    ]);

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error('Invalid JSON');
    }

    if (typeof data.name !== 'string' || typeof data.systemPrompt !== 'string') {
      throw new Error('Invalid persona data: missing name or systemPrompt');
    }

    const cleanName = (data.name as string)
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[^\w\s\-'.()]/g, '')
      .trim()
      .slice(0, 80);
    if (!cleanName) throw new Error('Persona name is empty after sanitization');

    const rawTools = Array.isArray(data.enabledTools) ? data.enabledTools : [];
    const safeTools = rawTools.filter(
      (t: unknown): t is string => typeof t === 'string' && SAFE_TOOL_WHITELIST.has(t),
    );
    const safeAllowedPaths = [{ path: '~/', mode: 'read' as const }];

    const validLevels = new Set(['paranoid', 'balanced', 'relaxed', 'trust']);
    const cl: ConfirmationLevel =
      typeof data.confirmationLevel === 'string' && validLevels.has(data.confirmationLevel)
        ? (data.confirmationLevel as ConfirmationLevel)
        : 'paranoid';

    const db = getDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const persona: PersonaConfig = {
      id,
      userId: '',
      name: cleanName,
      systemPrompt: data.systemPrompt as string,
      chatflowId: '',
      apiEndpoint: '',
      status: 'active',
      enabledTools: safeTools,
      allowedPaths: safeAllowedPaths,
      blockedPaths: [],
      confirmationLevel: cl,
      dangerousToolsEnabled: false,
      activityLogging: true,
      undoEnabled: true,
      sandboxEnabled: false,
      knowledgeBaseRefs: [],
      settings: (data.settings as PersonaSettings) ?? {},
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    db.upsertPersona(persona);
    await startAgent(persona);
    return { id, name: persona.name };
  });

  handleValidated('persona:stats', (_e, personaId: string) => {
    const db = getDatabase();
    const row = db.db.prepare(`
      SELECT COUNT(*) as count, MAX(cm.created_at) as last_active
      FROM chat_messages cm
      JOIN chat_sessions cs ON cm.session_id = cs.id
      WHERE cs.persona_id = ?
    `).get(personaId) as { count?: number; last_active?: string } | undefined;
    return {
      messageCount: row?.count ?? 0,
      lastActiveAt: row?.last_active ?? null,
    };
  });

  // ─── Knowledge base ─────────────────────────
  handleValidated('kb:upload', async (_e, personaId: string): Promise<KnowledgeDocument | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Upload Knowledge Document',
      filters: [{ name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    if (!filePath) return null;
    const db = getDatabase();
    const persona = db.getPersonaById(personaId);
    if (!persona) throw new Error(`Persona ${personaId} not found`);

    const { text, title } = await convertDocument(filePath);

    // Write the markdown into the persona's knowledge folder (OpenClaw reads
    // these .md files automatically at chat time).
    const knowledgeDir = path.join(os.homedir(), '.openclaw', 'agents', personaId, 'knowledge');
    fs.mkdirSync(knowledgeDir, { recursive: true });
    const mdFileName = `${title}.md`;
    const mdPath = path.join(knowledgeDir, mdFileName);
    fs.writeFileSync(mdPath, text, 'utf-8');

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '') as KnowledgeDocument['fileType'];
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

  handleValidated('kb:list', (_e, personaId: string) => {
    return getDatabase().getKnowledgeDocs(personaId);
  });

  handleValidated('kb:delete', (_e, docId: string) => {
    const db = getDatabase();
    const doc = db.deleteKnowledgeDoc(docId);
    if (doc && fs.existsSync(doc.workspacePath)) {
      fs.unlinkSync(doc.workspacePath);
    }
  });

  // ─── Sync ───────────────────────────────────
  handleValidated('sync:now', async () => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    return syncPersonas(token);
  });

  // ─── Backup ─────────────────────────────────
  handleValidated('backup:undo', (_e, backupId: string) => {
    const db = getDatabase();
    const record = db.getBackupById(backupId);
    const result = undo(backupId);
    if (result.success && record?.actionLogId) {
      db.updateActionLogResult(record.actionLogId, 'undone');
    }
    return result;
  });

  handleValidated('backup:history', (_e, personaId?: string) => {
    if (personaId) {
      return getDatabase().getActionLogsByPersona(personaId);
    }
    return getDatabase().getAllActionLogs();
  });

  // ─── OpenClaw setup ─────────────────────────
  handleValidated('openclaw:checkInstalled', async () => {
    const result = await checkInstallation();
    return result;
  });

  // Lets the renderer show "we detected your existing key" in the wizard
  // instead of asking for one that's already configured.
  handleValidated('openclaw:detectExisting', async () => {
    return {
      provider: getConfiguredProvider(),
      keyPreview: getConfiguredKeyPreview(),
    };
  });

  handleValidated('openclaw:install', async (_e, apiKey: string, provider: string) => {
    if (provider !== 'anthropic' && provider !== 'google') {
      throw new Error('Invalid provider: must be anthropic or google');
    }
    writeConfig(apiKey, provider);
    await startGateway();
    const ready = await waitForReady();
    if (!ready) throw new Error('Gateway failed to start within 30 seconds');
    wireSecurityLayer();
    initAgentBridge();
  });

  // ─── TTS / STT ──────────────────────────────
  // Simple rate-limiter: one TTS synthesis per 500ms. Without this a stuck
  // renderer loop could burn through cloud TTS credits fast.
  let lastTtsCall = 0;

  handleValidated('tts:synthesize', async (_event, text: string, voiceId: string, provider: string, personaId: string) => {
    const now = Date.now();
    if (now - lastTtsCall < 500) throw new Error('Rate limited — please wait');
    lastTtsCall = now;

    if (!text || typeof text !== 'string') throw new Error('Text is required');
    if (text.trim().length === 0) throw new Error('Text cannot be empty');
    if (text.length > 2000) throw new Error('Text exceeds 2000 character limit');
    if (!voiceId || !provider || !personaId) throw new Error('Missing required parameters');

    return generateSpeech(text, voiceId, provider);
  });

  handleValidated('stt:transcribe', async (_event, audioData: ArrayBuffer | Buffer, mimeType: string) => {
    if (!audioData || !(audioData instanceof ArrayBuffer || Buffer.isBuffer(audioData))) {
      throw new Error('Audio data is required');
    }
    const buf = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
    if (buf.length === 0) throw new Error('Audio data is empty');
    if (buf.length > 25 * 1024 * 1024) throw new Error('Audio exceeds 25MB limit');
    const mime = typeof mimeType === 'string' ? mimeType : 'audio/webm';
    const text = await transcribeAudio(buf, mime);
    return { text };
  });

  // ─── Voice key storage ──────────────────────
  handleValidated('voice:storeKey', async (_event, providerId: string, apiKey: string) => {
    return storeVoiceKey(providerId, apiKey);
  });

  handleValidated('voice:getKey', async (_event, providerId: string) => {
    return getVoiceKey(providerId);
  });

  // Audit finding P5-B-3: renderer only needs existence check, not the key.
  handleValidated('voice:hasKey', async (_event, providerId: string) => {
    return !!(await getVoiceKey(providerId));
  });

  handleValidated('voice:deleteKey', async (_event, providerId: string) => {
    return deleteVoiceKey(providerId);
  });

  // ─── Voice preferences ──────────────────────
  handleValidated('voice:getPrefs', async () => {
    const prefsPath = path.join(app.getPath('userData'), 'voice-prefs.json');
    try {
      if (fs.existsSync(prefsPath)) {
        return JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
      }
    } catch (err) {
      console.warn('[voice:getPrefs] Failed to read preferences:', err);
    }
    return {
      voiceOutputEnabled: true,
      voiceInputEnabled: false,
      defaultProvider: 'os-native',
      captionsEnabled: true,
      defaultAvatarStyle: 'face-warm',
      reducedMotionOverride: 'auto',
      localOnlyMode: false,
      autoStopOnBlur: true,
      monthlySpendCeiling: {},
      featureFlag: true,
      defaultSpeed: 1,
    };
  });

  handleValidated('voice:setPrefs', async (_event, prefs: Record<string, unknown>) => {
    const prefsPath = path.join(app.getPath('userData'), 'voice-prefs.json');
    let existing: Record<string, unknown> = {};
    try {
      if (fs.existsSync(prefsPath)) {
        existing = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
      }
    } catch (err) {
      console.warn('[voice:setPrefs] Failed to read existing preferences:', err);
    }
    const merged = { ...existing, ...prefs };
    fs.writeFileSync(prefsPath, JSON.stringify(merged, null, 2), 'utf-8');
  });

  // ─── LLM usage (for the Settings → AI cost dashboard) ──
  handleValidated('llm:getUsage', async () => {
    return getLlmMonthlySummary();
  });

  // ─── Voice diagnostics ──────────────────────
  handleValidated('voice:diagnostics', async () => {
    const results: Array<{ stage: string; status: string; errorCode?: string; errorMessage?: string }> = [];

    // Check secure store
    try {
      const { safeStorage } = await import('electron');
      results.push({
        stage: 'secure-store',
        status: safeStorage.isEncryptionAvailable() ? 'pass' : 'fail',
        errorCode: safeStorage.isEncryptionAvailable() ? undefined : 'ENCRYPTION_UNAVAILABLE',
      });
    } catch {
      results.push({ stage: 'secure-store', status: 'fail', errorCode: 'CHECK_FAILED' });
    }

    // Check gateway
    try {
      const { getState } = await import('./openclaw-manager');
      const state = getState();
      results.push({ stage: 'gateway', status: state.running ? 'pass' : 'fail' });
    } catch {
      results.push({ stage: 'gateway', status: 'fail', errorCode: 'GATEWAY_UNREACHABLE' });
    }

    // OS voices are only checkable in the renderer (via speechSynthesis API)
    results.push({ stage: 'os-voices', status: 'skip', errorMessage: 'Checked in renderer' });

    return results;
  });
}

// ─── App lifecycle ─────────────────────────────────

app.whenReady().then(async () => {
  try {
    initDatabase(app.getPath('userData'));
  } catch (err) {
    console.error('[main] initDatabase failed:', err);
    const { dialog } = await import('electron');
    dialog.showErrorBox(
      'Database initialization failed',
      `PersonaHub could not open its local database. Please try restarting the app.\n\n${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    app.exit(1);
    return;
  }

  // Clean up any leftover OpenClaw runtime files from previous installs.
  cleanupOldRuntime();

  // Backfill: some early personas were created with null enabled_tools —
  // restore sensible defaults so chat tools work out of the box.
  {
    const db = getDatabase();
    const defaultTools = JSON.stringify(['read', 'ls', 'web_search', 'web_fetch']);
    const defaultPaths = JSON.stringify([{ path: '~/', mode: 'read' }]);
    db.db.prepare(
      "UPDATE persona_configs SET enabled_tools = ?, allowed_paths = ? WHERE enabled_tools IS NULL OR enabled_tools = '[]'",
    ).run(defaultTools, defaultPaths);
  }

  registerProtocol();
  setupIPC();

  // Try to start the local OpenClaw gateway if it's already installed.
  // If no config yet, fall back to env vars (ANTHROPIC_API_KEY / GEMINI_API_KEY)
  // so users with keys in their shell skip the wizard entirely.
  const installed = (await checkInstallation()) || tryAutoBootstrapFromEnv();
  console.log('[main] checkInstallation:', installed);
  if (installed) {
    try {
      refreshConfigToken();
      await startGateway();
      const ready = await waitForReady();
      console.log('[main] gateway ready:', ready);
      if (ready) {
        wireSecurityLayer();
        initAgentBridge();
      }
    } catch (err) {
      console.error('[main] Failed to auto-start gateway:', err);
    }
  }

  createWindow();

  // Allow the renderer to use the microphone (for Web Speech API STT)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' && webContents === mainWindow?.webContents) {
      callback(true);
    } else {
      callback(false);
    }
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media';
  });

  // CSP — tighter in prod, dev needs the Vite server + gateway.
  const isDev = !!process.env.VITE_DEV_SERVER_URL;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:* http://127.0.0.1:18789 ws://127.0.0.1:18789; img-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:;"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:18789 ws://127.0.0.1:18789; img-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:;";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  // Block renderer from opening popups or navigating away from the SPA.
  mainWindow?.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow?.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.startsWith('file://')) return;
    event.preventDefault();
  });

  // Bridge power-monitor events to DOM events so useVoiceInput can auto-stop
  // the mic when the user locks their screen or the machine suspends.
  powerMonitor.on('lock-screen', () => {
    mainWindow?.webContents.send('power:lock');
  });
  powerMonitor.on('suspend', () => {
    mainWindow?.webContents.send('power:suspend');
  });

  if (mainWindow) {
    initTray(mainWindow);
    registerShortcuts(mainWindow);
    initAutoUpdater(mainWindow);
  }

  // Forward streamed agent responses + tool calls to the renderer.
  onResponse((chunk) => mainWindow?.webContents.send('agent:response', chunk));
  onToolCall((toolCall) => mainWindow?.webContents.send('agent:toolCall', toolCall));

  app.setLoginItemSettings({ openAtLogin: true });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});

app.on('open-url', (_event, url) => {
  handleDeepLink(url);
});

app.on('second-instance', (_event, commandLine) => {
  const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`));
  if (url) handleDeepLink(url);
  mainWindow?.show();
});

// Graceful shutdown — stop gateway, save DB, etc. Guard against re-entry so
// we don't deadlock during double-quit signals.
let cleanupInProgress = false;
app.on('before-quit', (event) => {
  isQuitting = true;
  if (cleanupInProgress) return;
  cleanupInProgress = true;
  event.preventDefault();
  (async () => {
    try {
      unregisterShortcuts();
      destroyTray();
      disconnectGatewayWS();
      await stopAllAgents();
      stopGateway();
      closeDatabase();
    } catch (err) {
      console.error('[main] Error during shutdown cleanup:', err);
    } finally {
      app.quit();
    }
  })();
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

export { mainWindow };
