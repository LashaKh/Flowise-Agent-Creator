/**
 * Preload Script — The security bridge between Electron's main process and the React UI.
 *
 * Think of this as a bouncer: the React app can't directly access Node.js or the filesystem.
 * Instead, it calls these safe, named functions which forward requests to the main process.
 */
import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // ─── Auth ────────────────────────────────────
  auth: {
    getState: () => ipcRenderer.invoke('auth:getState'),
    signIn: (email: string, password: string) => ipcRenderer.invoke('auth:signIn', email, password),
    refresh: () => ipcRenderer.invoke('auth:refresh'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    storeToken: (token: string) => ipcRenderer.invoke('auth:storeToken', token),
    clearToken: () => ipcRenderer.invoke('auth:clearToken'),
    onCallback: (callback: (result: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, result: unknown) => callback(result);
      ipcRenderer.on('auth:callback', handler);
      return () => ipcRenderer.removeListener('auth:callback', handler);
    },
  },

  // ─── Chat (typed replacements for raw SQL) ───────
  chat: {
    getOrCreateSession: (personaId: string) =>
      ipcRenderer.invoke('chat:getOrCreateSession', personaId),
    createSession: (personaId: string) =>
      ipcRenderer.invoke('chat:createSession', personaId),
    listSessions: (personaId: string) =>
      ipcRenderer.invoke('chat:listSessions', personaId),
    renameSession: (sessionId: string, title: string) =>
      ipcRenderer.invoke('chat:renameSession', sessionId, title),
    deleteSession: (sessionId: string) =>
      ipcRenderer.invoke('chat:deleteSession', sessionId),
    autoTitle: (sessionId: string, userMessage: string, assistantReply: string) =>
      ipcRenderer.invoke('chat:autoTitle', sessionId, userMessage, assistantReply),
    loadMessages: (sessionId: string) =>
      ipcRenderer.invoke('chat:loadMessages', sessionId),
    saveMessage: (msg: Record<string, unknown>) =>
      ipcRenderer.invoke('chat:saveMessage', msg),
    getLastMessage: (personaId: string) =>
      ipcRenderer.invoke('chat:getLastMessage', personaId),
  },

  // ─── Preferences ─────────────────────────────
  prefs: {
    load: () => ipcRenderer.invoke('prefs:load'),
    save: (updates: Record<string, unknown>) =>
      ipcRenderer.invoke('prefs:save', updates),
  },

  // ─── Security ────────────────────────────────
  security: {
    evaluateAction: (request: unknown) =>
      ipcRenderer.invoke('security:evaluate', request),
    confirmAction: (requestId: string, response: unknown) =>
      ipcRenderer.invoke('security:confirm', requestId, response),
    onConfirmRequest: (callback: (request: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, req: unknown) => callback(req);
      ipcRenderer.on('security:confirmRequest', handler);
      return () => ipcRenderer.removeListener('security:confirmRequest', handler);
    },
  },

  // ─── Agent ───────────────────────────────────
  agent: {
    sendMessage: (personaId: string, sessionId: string, message: string) =>
      ipcRenderer.invoke('agent:send', personaId, sessionId, message),
    createPersona: (name: string, description: string, options?: { temperature?: number; confirmationLevel?: string; modelName?: string }) =>
      ipcRenderer.invoke('persona:create', name, description, options),
    listPersonas: () => ipcRenderer.invoke('persona:list'),
    sidebarList: () => ipcRenderer.invoke('persona:sidebarList'),
    ensureDefault: () => ipcRenderer.invoke('persona:ensureDefault'),
    getPersona: (id: string) => ipcRenderer.invoke('persona:get', id),
    updatePersona: (id: string, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('persona:update', id, updates),
    deletePersona: (id: string) => ipcRenderer.invoke('persona:delete', id),
    duplicatePersona: (id: string) => ipcRenderer.invoke('persona:duplicate', id),
    regeneratePrompt: (id: string) => ipcRenderer.invoke('persona:regeneratePrompt', id),
    clearHistory: (personaId: string) => ipcRenderer.invoke('persona:clearHistory', personaId),
    exportPersona: (id: string) => ipcRenderer.invoke('persona:export', id),
    importPersona: (json: string) => ipcRenderer.invoke('persona:import', json),
    getStats: (personaId: string) => ipcRenderer.invoke('persona:stats', personaId),
    onResponse: (callback: (chunk: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, chunk: unknown) => callback(chunk);
      ipcRenderer.on('agent:response', handler);
      return () => ipcRenderer.removeListener('agent:response', handler);
    },
    onToolCall: (callback: (toolCall: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, toolCall: unknown) => callback(toolCall);
      ipcRenderer.on('agent:toolCall', handler);
      return () => ipcRenderer.removeListener('agent:toolCall', handler);
    },
    onPersonaDeleted: (callback: (personaId: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, personaId: string) => callback(personaId);
      ipcRenderer.on('persona:deleted', handler);
      return () => ipcRenderer.removeListener('persona:deleted', handler);
    },
    stopGeneration: (personaId: string) =>
      ipcRenderer.invoke('agent:stop', personaId),
    uploadKnowledgeDoc: (personaId: string) =>
      ipcRenderer.invoke('kb:upload', personaId),
    listKnowledgeDocs: (personaId: string) =>
      ipcRenderer.invoke('kb:list', personaId),
    deleteKnowledgeDoc: (docId: string) =>
      ipcRenderer.invoke('kb:delete', docId),
  },

  // ─── Sync ────────────────────────────────────
  sync: {
    syncNow: () => ipcRenderer.invoke('sync:now'),
    onSyncComplete: (callback: (result: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, result: unknown) => callback(result);
      ipcRenderer.on('sync:complete', handler);
      return () => ipcRenderer.removeListener('sync:complete', handler);
    },
    onPermissionEscalation: (callback: (escalation: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, esc: unknown) => callback(esc);
      ipcRenderer.on('sync:permissionEscalation', handler);
      return () => ipcRenderer.removeListener('sync:permissionEscalation', handler);
    },
  },

  // ─── Backup ──────────────────────────────────
  backup: {
    undo: (backupId: string) => ipcRenderer.invoke('backup:undo', backupId),
    getHistory: (personaId?: string) =>
      ipcRenderer.invoke('backup:history', personaId),
  },

  // ─── OpenClaw ───────────────────────────────────
  openclaw: {
    checkInstalled: () => ipcRenderer.invoke('openclaw:checkInstalled'),
    install: (apiKey: string, provider: string) => ipcRenderer.invoke('openclaw:install', apiKey, provider),
    detectExisting: () => ipcRenderer.invoke('openclaw:detectExisting'),
    validateKey: (apiKey: string, provider: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('openclaw:validateKey', apiKey, provider),
  },

  // ─── Voice & Avatar TTS ──────────────────────
  tts: {
    synthesize: (text: string, voiceId: string, provider: string, personaId: string) =>
      ipcRenderer.invoke('tts:synthesize', text, voiceId, provider, personaId),
  },

  // ─── Speech-to-Text ────────────────────────
  stt: {
    transcribe: (audio: ArrayBuffer, mimeType: string) =>
      ipcRenderer.invoke('stt:transcribe', audio, mimeType),
  },

  voice: {
    storeKey: (providerId: string, apiKey: string) =>
      ipcRenderer.invoke('voice:storeKey', providerId, apiKey),
    hasKey: (providerId: string) =>
      ipcRenderer.invoke('voice:hasKey', providerId),
    deleteKey: (providerId: string) =>
      ipcRenderer.invoke('voice:deleteKey', providerId),
    getPrefs: () => ipcRenderer.invoke('voice:getPrefs'),
    setPrefs: (prefs: Record<string, unknown>) =>
      ipcRenderer.invoke('voice:setPrefs', prefs),
    runDiagnostics: () => ipcRenderer.invoke('voice:diagnostics'),
  },

  // ─── LLM Usage Stats ─────────────────────────
  llm: {
    getUsage: () => ipcRenderer.invoke('llm:getUsage'),
  },

  // ─── Dev-only perf profiling (CLAUDE.md alignment, QA PERF-INFRA) ──
  perf: {
    memory: () => ipcRenderer.invoke('perf:memory'),
  },

  // ─── Window ──────────────────────────────────
  window: {
    show: () => ipcRenderer.invoke('window:show'),
    hide: () => ipcRenderer.invoke('window:hide'),
    isVisible: () => ipcRenderer.invoke('window:isVisible'),
  },

  // ─── App Info ────────────────────────────────
  app: {
    getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },

  // ─── Auto-Updater ─────────────────────────────
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (status: unknown) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, status: unknown) => callback(status);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.removeListener('updater:status', handler);
    },
  },
};

// Expose to renderer as window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Bridge power monitor events (lock-screen / suspend) from the main process
// to DOM events the renderer can listen for. Without this bridge the
// useVoiceInput hook's `window.addEventListener('power:lock')` listeners
// never fire and the microphone stays active during sleep (audit P3-D-5).
ipcRenderer.on('power:lock', () => window.dispatchEvent(new Event('power:lock')));
ipcRenderer.on('power:suspend', () => window.dispatchEvent(new Event('power:suspend')));

export type ElectronAPI = typeof electronAPI;
