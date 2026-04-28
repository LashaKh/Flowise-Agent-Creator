import { app, BrowserWindow, dialog, session, powerMonitor } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initTray, destroyTray, isTrayActive } from './tray';
import { handleAuthCallback, getAuthState, refreshToken, logout, signInWithPassword } from './auth';
import { getToken, storeToken, clearToken } from './secure-store';
import { registerShortcuts, unregisterShortcuts, updateShortcut, DEFAULT_SHORTCUT } from './shortcuts';
import { initAutoUpdater, checkForUpdates, installUpdate } from './updater';
import { handleValidated, setMainWindow } from './ipc-validation';
import {
  generateSpeech,
  transcribeAudio,
  generateSessionTitle,
  disconnect as disconnectGatewayWS,
} from './openclaw-client';
import { setConfirmHandler as setOpenRouterConfirmHandler } from './openrouter-client';
import { openrouterGeneratePrompt } from './openrouter-prompt-gen';
import { storeVoiceKey, deleteVoiceKey, hasVoiceKey } from './voice-key-store';
import { getMonthlySummary as getLlmMonthlySummary } from './llm-usage-log';

// Database
import { initDatabase, closeDatabase, getDatabase, prefsBus, type PrefsChangeEvent } from '../db/init';

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
  isGatewayReady,
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
  getLastStartupError,
  isSetupComplete,
  markSetupSkipped,
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

// ─── E2E test mode ─────────────────────────────────
// Activated by PERSONAHUB_E2E=1 when running under Playwright. Isolates
// userData to a temp dir, skips the OpenClaw gateway startup (so the app
// boots without a live LLM), and short-circuits `openclaw:checkInstalled`
// so the renderer skips SetupWizard and shows the main UI immediately.
// Guarded by `!app.isPackaged` so a stray env var in production can never
// trigger this path.
const IS_E2E = process.env.PERSONAHUB_E2E === '1' && !app.isPackaged;
if (IS_E2E) {
  // Use a unique subdir per-run (timestamp + pid) so we never collide with a
  // stale SingletonLock from a crashed previous run. Electron ≥41 is stricter
  // about lock files and refuses to boot if the lock exists with ownership
  // it can't clear.
  const e2eDir = path.join(os.tmpdir(), `personahub-e2e-${Date.now()}-${process.pid}`);
  fs.mkdirSync(e2eDir, { recursive: true });
  app.setPath('userData', e2eDir);
  // Also disable the single-instance lock entirely in E2E — we always want
  // a fresh instance. Calling requestSingleInstanceLock without the lock
  // file present still creates one, but our unique dir makes that harmless.
  console.log('[main][E2E] userData =>', e2eDir);
}

// ─── Single instance lock ──────────────────────────
// Skipped in dev mode because vite-plugin-electron's rapid restart cycle
// can leave stale lock state that prevents subsequent launches.
// Also skipped in E2E mode so Playwright-driven runs always launch cleanly
// (we use a unique per-run userData dir above so there's no real collision).
const isDevMode = !!process.env.VITE_DEV_SERVER_URL;
if (!isDevMode && !IS_E2E) {
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
  // BUT: if the tray failed to initialize (missing icon, OS rejection),
  // fall back to actually quitting on close so the user isn't stranded
  // with a hidden window they can't restore.
  mainWindow.on('close', (e) => {
    if (!isQuitting && isTrayActive()) {
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

// Pending confirmation promises, keyed by requestId. The OpenRouter tool-call
// loop creates an entry here, sends a 'security:confirmRequest' IPC event to
// the renderer, and awaits until the renderer replies via 'security:confirm'.
// Stored at module scope so the 'security:confirm' IPC handler can resolve them.
const pendingConfirmPromises = new Map<
  string,
  (result: { allow: boolean; rememberMinutes?: number; alwaysPathPattern?: string }) => void
>();

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

  // Inject the confirmation asker into the OpenRouter client so its tool-call
  // loop can surface ConfirmDialog in the renderer and wait for a decision.
  setOpenRouterConfirmHandler(async (request, personaName, tier, contentPreview) => {
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      pendingConfirmPromises.set(requestId, resolve);
      if (!mainWindow || mainWindow.isDestroyed()) {
        // No window to ask — deny to stay safe
        pendingConfirmPromises.delete(requestId);
        resolve({ allow: false });
        return;
      }
      mainWindow.webContents.send('security:confirmRequest', {
        id: requestId,
        personaName,
        tool: request.tool,
        action: request.action,
        target: request.target,
        contentPreview,
        tier,
      });
    });
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
  // auth:getToken intentionally NOT exposed. The renderer must never see the
  // Supabase access/refresh token — if it did, any XSS (markdown render bug,
  // dependency compromise) would be a free exfil path. Main-process callers
  // (sync/platform-sync.ts) import `getToken` directly from ./auth.
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
    // Legacy path — used by the older renderer-driven evaluate flow to record
    // "allow always" / "block always" decisions in permission memory.
    const orig = pendingRequests.get(requestId);
    if (orig) {
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
    }

    // New path — resolve the promise that the OpenRouter tool-call loop is
    // awaiting. `security:confirm` is fired by the renderer once the user
    // clicks a button in ConfirmDialog.
    const resolver = pendingConfirmPromises.get(requestId);
    if (resolver) {
      const allow = response.decision === 'allow_once' || response.decision === 'allow_always';
      const alwaysPathPattern = response.decision === 'allow_always' && 'pathPattern' in response
        ? response.pathPattern
        : undefined;
      const rememberMinutes = response.decision === 'allow_once' && 'rememberMinutes' in response
        ? response.rememberMinutes
        : undefined;
      resolver({ allow, rememberMinutes, alwaysPathPattern });
      pendingConfirmPromises.delete(requestId);
    }
  });

  // ─── Agent ──────────────────────────────────
  handleValidated('agent:send', async (_e, personaId: string, sessionId: string, message: string) => {
    // Fail fast with a user-facing message if the agent bridge didn't
    // initialize — otherwise the request would die at the network layer
    // with a cryptic ECONNREFUSED that bubbles up much later. In normal
    // operation the bridge is always ready (either OpenClaw-mode after
    // gateway startup, or OpenRouter-only mode for the bundled-key path).
    if (!isGatewayReady()) {
      throw new Error('AI engine is not ready. Try restarting the app, or open Settings → run Diagnostics.');
    }
    const persona = getDatabase().getPersonaById(personaId);
    if (!persona) throw new Error(`Persona ${personaId} not found`);
    await startAgent(persona);

    // Session-scoped history: OpenRouter personas need priorMessages for
    // memory, and scoping to the active session keeps each conversation
    // isolated. Drop the most recent user message (the one we're sending)
    // since the renderer persisted it before this IPC call.
    const sessionMessages = getDatabase().getChatMessagesBySession(sessionId);
    const priorMessages = sessionMessages
      .filter((m) => !!m.content && (m.role === 'user' || m.role === 'assistant'))
      .slice(0, -1)
      .slice(-20)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    await agentSendMessage(personaId, sessionId, message, persona, priorMessages);
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
    // QA finding E2E1: when the OpenClaw gateway is unreachable (not yet
    // installed, offline, or crashed), `generatePrompt` throws ECONNREFUSED
    // and the user sees a cryptic error. Fall back to a reasonable
    // placeholder prompt so the persona still gets created — the user can
    // later hit "Regenerate Prompt" in Settings once the gateway is up.
    // Always go through OpenRouter for prompt generation — the bundled key
    // (or user's own) is available by default in OpenRouter-only mode.
    // The legacy openclaw `generatePrompt` is no longer reached here, but
    // remains imported for `generateSessionTitle` which uses the gateway
    // when it IS running and is gracefully optional otherwise.
    let systemPrompt: string;
    let usedFallbackPrompt = false;
    try {
      systemPrompt = await openrouterGeneratePrompt(name, description);
    } catch (err) {
      console.warn('[persona:create] openrouterGeneratePrompt failed, using placeholder:', err);
      usedFallbackPrompt = true;
      systemPrompt = [
        `You are ${name}.`,
        '',
        description?.trim() || 'A helpful AI assistant.',
        '',
        "(Placeholder — your AI couldn't reach the prompt generator. You can write your own in Settings → Edit Persona → System Prompt, or click Regenerate to try again.)",
      ].join('\n');
    }

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
      // Write SOUL.md/AGENTS.md/IDENTITY.md for this persona. If the filesystem
      // write fails, roll back the DB insert so the UI doesn't show an
      // orphaned persona that can't chat (QA finding INT2).
      try {
        await startAgent(persona);
      } catch (err) {
        console.error('[persona:create] startAgent failed, rolling back DB row:', err);
        try { db.db.prepare('DELETE FROM persona_configs WHERE id = ?').run(id); } catch {}
        // Best-effort cleanup of any partial agent files under ~/.openclaw/agents/{id}/.
        try {
          const agentDir = path.join(os.homedir(), '.openclaw', 'agents', id);
          if (fs.existsSync(agentDir)) fs.rmSync(agentDir, { recursive: true, force: true });
        } catch {}
        throw err;
      }
    }
    return { id, name, systemPrompt, usedFallbackPrompt };
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

    // Any update rebuilds the agent config (SOUL.md, AGENTS.md, IDENTITY.md,
    // gateway registration). `startAgent` is now idempotent and cheap —
    // better to over-refresh than to leave stale caches around.
    // Previously this only fired for 4 fields, so settings-only updates
    // (voice, temperature, modelName, personaMemory) never took effect
    // until app restart.
    await startAgent(persona);

    return persona;
  });

  handleValidated('persona:delete', async (_e, id: string) => {
    const db = getDatabase();
    const persona = db.getPersonaById(id);
    if (!persona) throw new Error(`Persona ${id} not found`);

    await stopAgent(id);
    removeAgentConfig(id);

    // All row-level deletes are now owned by LocalDB.deletePersona as a
    // single atomic transaction (QA finding INT4). Keeps the cascade
    // logic in one place and guarantees atomicity even if future callers
    // bypass this IPC handler.
    db.deletePersona(id);

    // QA finding INT4 / Phase 3.5: let the renderer cancel any in-flight
    // TTS or tool call bound to this persona so it doesn't keep talking
    // after the user deleted it.
    mainWindow?.webContents.send('persona:deleted', id);
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

    // OpenRouter-backed regeneration — works whether or not the openclaw
    // gateway is running. Uses the existing prompt's first 200 chars as
    // the description so regeneration preserves the persona's flavor.
    const systemPrompt = await openrouterGeneratePrompt(
      persona.name,
      persona.systemPrompt.slice(0, 200),
    );
    persona.systemPrompt = systemPrompt;
    persona.updatedAt = new Date().toISOString();
    db.upsertPersona(persona);
    await startAgent(persona);
    return { systemPrompt };
  });

  // Auto-title a session from its first exchange. Called by the renderer
  // after the first assistant reply completes so new sessions graduate from
  // "New chat · 2:14 PM" to something meaningful like "Trip plans for Japan".
  handleValidated('chat:autoTitle', async (_e, sessionId: string, userMessage: string, assistantReply: string) => {
    try {
      const title = await generateSessionTitle(userMessage, assistantReply);
      if (title) {
        getDatabase().updateChatSessionTitle(sessionId, title);
        return { title };
      }
      return { title: null };
    } catch (err) {
      console.warn('[chat:autoTitle] Failed to generate title (non-fatal):', err);
      return { title: null };
    }
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

    // QA finding SEC16: sanitize the title into a safe filename. The title is
    // derived from the source document's content (convertDocument) so a
    // crafted PDF could include path separators or "..". Replace anything
    // outside [A-Za-z0-9._-] with underscore and trim length.
    const safeTitle = (title || 'document')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'document';
    const mdFileName = `${safeTitle}.md`;
    const mdPath = path.join(knowledgeDir, mdFileName);

    // Defense in depth: resolve the final absolute path and assert it stays
    // inside the persona's knowledge directory. Rejects any lingering
    // traversal attempt that survived sanitization.
    const resolvedMdPath = path.resolve(mdPath);
    const resolvedKnowledgeDir = path.resolve(knowledgeDir);
    if (!resolvedMdPath.startsWith(resolvedKnowledgeDir + path.sep)) {
      throw new Error('Invalid knowledge document path — refusing to write outside knowledge dir');
    }
    // QA finding INT2: insert the DB row FIRST, then write the file. If the
    // file write fails we roll back the DB insert, so we never end up with
    // an orphaned .md file that the LLM keeps reading but the UI can't list.
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '') as KnowledgeDocument['fileType'];
    const doc: KnowledgeDocument = {
      id: crypto.randomUUID(),
      personaId,
      title,
      fileName: path.basename(filePath),
      fileType: ext,
      fileSize: stat.size,
      workspacePath: resolvedMdPath,
      createdAt: new Date().toISOString(),
    };
    db.insertKnowledgeDoc(doc);
    try {
      fs.writeFileSync(resolvedMdPath, text, 'utf-8');
    } catch (err) {
      // File write failed — roll back the DB row so we don't leak a ghost
      // document that the UI lists but chat can't reference.
      try { db.deleteKnowledgeDoc(doc.id); } catch {}
      throw err;
    }
    return doc;
  });

  handleValidated('kb:list', (_e, personaId: string) => {
    return getDatabase().getKnowledgeDocs(personaId);
  });

  handleValidated('kb:delete', (_e, docId: string) => {
    const db = getDatabase();
    // QA finding INT3: unlink the file FIRST, then remove the DB row. If
    // we went DB-first and the unlink failed (Windows AV/indexer file lock),
    // the agent would keep reading a "deleted" document the UI could no
    // longer manage.
    const doc = db.getKnowledgeDocById(docId);
    if (doc && fs.existsSync(doc.workspacePath)) {
      try {
        fs.unlinkSync(doc.workspacePath);
      } catch (err) {
        // Leave the DB row in place so the user can retry the delete.
        console.error('[kb:delete] unlink failed, keeping DB row:', err);
        throw err;
      }
    }
    db.deleteKnowledgeDoc(docId);
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
    if (IS_E2E) return true; // E2E skips OpenClaw install — UI must render without it
    // The renderer's wizard gate is "has the user completed setup, in any
    // form?" — including the "Continue without setup" / OpenRouter-only
    // path. checkInstallation() is the stricter test (does an openclaw
    // provider have a real key) used elsewhere.
    return isSetupComplete();
  });

  // User chose "Continue without setup" — record the skip marker so the
  // wizard isn't shown again on subsequent launches. The bundled OpenRouter
  // key (in openrouter-config.ts) provides chat capability with no setup.
  handleValidated('openclaw:skipSetup', async () => {
    markSetupSkipped();
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
    if (!ready) {
      // Prefer the specific reason captured from stderr (port collision,
      // spawn failure, …) over the generic timeout. Falls back to the
      // 30s message only if no specific reason was recorded.
      const reason = getLastStartupError();
      throw new Error(reason ?? 'Gateway failed to start within 30 seconds');
    }
    wireSecurityLayer();
    initAgentBridge();
  });

  // Light validation of an API key BEFORE we save it to disk and launch
  // the gateway. Catches typos and revoked keys up front so the user sees
  // "key was rejected" on the wizard instead of a cryptic stream error
  // later. Renderer-side fetch is blocked by CSP, so we proxy through
  // main where outbound HTTPS is unrestricted.
  handleValidated('openclaw:validateKey', async (_e, apiKey: string, provider: string) => {
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      return { ok: false, error: 'API key is empty' };
    }
    if (provider !== 'anthropic' && provider !== 'google') {
      return { ok: false, error: 'Invalid provider' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      let res: Response;
      if (provider === 'anthropic') {
        res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          signal: controller.signal,
        });
      } else {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
          { signal: controller.signal },
        );
      }
      if (res.ok) return { ok: true };
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'API key was rejected by the provider. Double-check it and try again.' };
      }
      if (res.status === 429) {
        // Rate-limited — accept the key, the rate limit isn't our problem to solve here
        return { ok: true };
      }
      return { ok: false, error: `Provider returned HTTP ${res.status}. Please try again.` };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        ok: false,
        error: isAbort
          ? 'Validation timed out. Check your internet connection and try again.'
          : err instanceof Error ? err.message : 'Failed to reach provider',
      };
    } finally {
      clearTimeout(timeoutId);
    }
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

  // voice:getKey intentionally NOT exposed. The renderer must never see a
  // decrypted cloud-TTS or OpenRouter key. Use voice:hasKey to check existence;
  // main-process callers (openrouter-config.ts, openclaw-client.ts) call
  // `getVoiceKey` directly.
  handleValidated('voice:hasKey', async (_event, providerId: string) => {
    return hasVoiceKey(providerId);
  });

  handleValidated('voice:deleteKey', async (_event, providerId: string) => {
    return deleteVoiceKey(providerId);
  });

  // ─── Voice preferences ──────────────────────
  handleValidated('voice:getPrefs', async () => {
    const prefsPath = path.join(app.getPath('userData'), 'voice-prefs.json');
    // Defaults and stored prefs are merged on read so a partial file
    // (e.g. only { defaultAvatarStyle }) doesn't leave required keys undefined
    // in the renderer — which was silencing voice output after an avatar pick.
    const defaults = {
      voiceOutputEnabled: true,
      voiceInputEnabled: false,
      defaultProvider: 'os-native' as const,
      captionsEnabled: true,
      defaultAvatarStyle: 'face-warm' as const,
      reducedMotionOverride: 'auto' as const,
      localOnlyMode: false,
      autoStopOnBlur: true,
      monthlySpendCeiling: {},
      featureFlag: true,
      defaultSpeed: 1,
    };
    let stored: Record<string, unknown> = {};
    try {
      if (fs.existsSync(prefsPath)) {
        stored = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
      }
    } catch (err) {
      console.warn('[voice:getPrefs] Failed to read preferences:', err);
    }
    return { ...defaults, ...stored };
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
    // QA finding INT3: atomic write via tmp + rename. A crash mid-write used
    // to truncate voice-prefs.json to empty, silently reverting all user
    // preferences. `renameSync` is atomic on POSIX and on Windows ≥ Vista.
    const tmpPath = `${prefsPath}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf-8');
      fs.renameSync(tmpPath, prefsPath);
    } catch (err) {
      try { fs.unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
      throw err;
    }
  });

  // ─── LLM usage (for the Settings → AI cost dashboard) ──
  handleValidated('llm:getUsage', async () => {
    return getLlmMonthlySummary();
  });

  // ─── Dev-only perf snapshot (QA PERF-INFRA) ─────
  // Only exposed when running under vite dev or E2E mode. Production builds
  // get an empty object so callers can still invoke the IPC safely without
  // branching on dev vs prod.
  handleValidated('perf:memory', async () => {
    if (app.isPackaged) return {};
    const m = process.memoryUsage();
    return {
      rss: m.rss,
      heapTotal: m.heapTotal,
      heapUsed: m.heapUsed,
      external: m.external,
    };
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

// Single-instance lock: if another copy of PersonaHub is already running,
// focus its window instead of launching a duplicate (which would fight over
// ports 5173 / 18789 and spawn zombie gateways).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

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

  // Boot the agent bridge. Two paths:
  //   1. OpenClaw mode: user has Anthropic/Gemini configured → start
  //      gateway, wire security, init bridge with gateway connected.
  //   2. OpenRouter-only mode: no openclaw config → skip gateway, but
  //      STILL init the bridge so OpenRouter chat works out-of-the-box
  //      with the bundled API key. This is the "Continue without setup"
  //      path; testers can chat immediately with no configuration.
  // E2E mode skips both — no external calls during test.
  if (!IS_E2E) {
    let gatewayUp = false;
    const installed = (await checkInstallation()) || tryAutoBootstrapFromEnv();
    console.log('[main] checkInstallation:', installed);
    if (installed) {
      try {
        refreshConfigToken();
        await startGateway();
        const ready = await waitForReady();
        console.log('[main] gateway ready:', ready);
        gatewayUp = ready;
      } catch (err) {
        console.error('[main] Failed to auto-start gateway:', err);
      }
    }
    // Always wire the security layer (it's pure function pointers — no
    // network) and init the bridge in whichever mode applies.
    wireSecurityLayer();
    initAgentBridge({ openRouterOnly: !gatewayUp });
    console.log('[main] agent bridge initialized in', gatewayUp ? 'gateway' : 'openrouter-only', 'mode');
  } else {
    console.log('[main][E2E] Skipping OpenClaw gateway startup.');
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

  // Load user preferences ONCE so the initial shortcut / login-item state
  // honors the user's saved choices instead of hard-coded defaults.
  const prefs = getDatabase().getOrCreatePreferences('default');

  if (mainWindow) {
    initTray(mainWindow);
    registerShortcuts(mainWindow, prefs.globalKeyboardShortcut || DEFAULT_SHORTCUT);
    if (!IS_E2E) initAutoUpdater(mainWindow); // E2E: no external update checks
  }

  // Forward streamed agent responses + tool calls to the renderer.
  onResponse((chunk) => mainWindow?.webContents.send('agent:response', chunk));
  onToolCall((toolCall) => mainWindow?.webContents.send('agent:toolCall', toolCall));

  app.setLoginItemSettings({ openAtLogin: prefs.startOnLogin });

  // React to pref changes live — no app restart required.
  prefsBus.on('changed', (event: PrefsChangeEvent) => {
    if (event.updated.globalKeyboardShortcut !== undefined) {
      updateShortcut(event.current.globalKeyboardShortcut || DEFAULT_SHORTCUT);
    }
    if (event.updated.startOnLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: event.current.startOnLogin });
    }
  });
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

  // Reject any tool-call confirmations still awaiting user input so the
  // tool-call agent loop unblocks and lets the app exit cleanly.
  for (const [id, resolve] of pendingConfirmPromises) {
    resolve({ allow: false });
    pendingConfirmPromises.delete(id);
  }

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
