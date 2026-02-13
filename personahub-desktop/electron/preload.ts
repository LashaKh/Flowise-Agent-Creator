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
    getToken: () => ipcRenderer.invoke('auth:getToken'),
    storeToken: (token: string) => ipcRenderer.invoke('auth:storeToken', token),
    clearToken: () => ipcRenderer.invoke('auth:clearToken'),
    onCallback: (callback: (result: unknown) => void) => {
      ipcRenderer.on('auth:callback', (_e, result) => callback(result));
    },
  },

  // ─── Database ────────────────────────────────
  db: {
    query: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:query', sql, params),
    run: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:run', sql, params),
    get: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:get', sql, params),
    all: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('db:all', sql, params),
  },

  // ─── Security ────────────────────────────────
  security: {
    evaluateAction: (request: unknown) =>
      ipcRenderer.invoke('security:evaluate', request),
    confirmAction: (requestId: string, response: unknown) =>
      ipcRenderer.invoke('security:confirm', requestId, response),
    onConfirmRequest: (callback: (request: unknown) => void) => {
      ipcRenderer.on('security:confirmRequest', (_e, req) => callback(req));
    },
  },

  // ─── Agent ───────────────────────────────────
  agent: {
    sendMessage: (personaId: string, message: string) =>
      ipcRenderer.invoke('agent:send', personaId, message),
    createPersona: (name: string, description: string, options?: { temperature?: number; confirmationLevel?: string }) =>
      ipcRenderer.invoke('persona:create', name, description, options),
    listPersonas: () => ipcRenderer.invoke('persona:list'),
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
      ipcRenderer.on('agent:response', (_e, chunk) => callback(chunk));
    },
    onToolCall: (callback: (toolCall: unknown) => void) => {
      ipcRenderer.on('agent:toolCall', (_e, toolCall) => callback(toolCall));
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
      ipcRenderer.on('sync:complete', (_e, result) => callback(result));
    },
    onPermissionEscalation: (callback: (escalation: unknown) => void) => {
      ipcRenderer.on('sync:permissionEscalation', (_e, esc) => callback(esc));
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
    onProgress: (cb: (pct: number) => void) => {
      ipcRenderer.on('openclaw:progress', (_e, pct) => cb(pct));
    },
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
      ipcRenderer.on('updater:status', (_e, status) => callback(status));
    },
  },
};

// Expose to renderer as window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
