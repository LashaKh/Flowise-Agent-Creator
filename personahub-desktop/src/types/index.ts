/**
 * Shared TypeScript types for PersonaHub Desktop
 * Based on contracts/sync-api.ts and contracts/security-types.ts
 */

// ─── Persona Types ─────────────────────────────

export interface PersonaConfig {
  id: string;
  userId: string;
  name: string;
  systemPrompt: string;
  chatflowId: string;
  apiEndpoint: string;
  status: 'creating' | 'active' | 'failed' | 'deleted';
  enabledTools: string[];
  allowedPaths: PathPermission[];
  blockedPaths: string[];
  confirmationLevel: ConfirmationLevel;
  dangerousToolsEnabled: boolean;
  activityLogging: boolean;
  undoEnabled: boolean;
  sandboxEnabled: boolean;
  knowledgeBaseRefs: KnowledgeBaseRef[];
  settings: PersonaSettings;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaSettings {
  temperature?: number;
  modelName?: string;
  customInstructions?: string;
}

export interface PathPermission {
  path: string;
  mode: 'read' | 'readwrite';
}

export interface KnowledgeBaseRef {
  docId: string;
  title: string;
  updatedAt: string;
}

export type ConfirmationLevel = 'paranoid' | 'balanced' | 'relaxed' | 'trust';

// ─── Security Types ────────────────────────────

export type ToolTier = 'safe' | 'guarded' | 'dangerous' | 'blocked';

export interface ToolClassification {
  tool: string;
  tier: ToolTier;
  description: string;
}

export interface ActionRequest {
  tool: string;
  action: string;
  target?: string;
  content?: string;
  personaId: string;
}

export type ActionResult = 'allow' | 'deny' | 'confirm';

export interface ActionEvaluation {
  result: ActionResult;
  reason?: string;
  tier: ToolTier;
}

export interface ConfirmationRequest {
  id: string;
  personaName: string;
  tool: string;
  action: string;
  target?: string;
  contentPreview?: string;
  tier: ToolTier;
}

export type ConfirmationResponse =
  | { decision: 'allow_once' }
  | { decision: 'allow_always'; pathPattern: string }
  | { decision: 'deny' }
  | { decision: 'block' }
  | { decision: 'allow_once'; rememberMinutes: number };

// ─── Backup Types ──────────────────────────────

export interface BackupRecord {
  id: string;
  actionLogId: string;
  originalPath: string;
  backupPath: string;
  actionType: 'write' | 'edit' | 'delete';
  fileExisted: boolean;
  undone: boolean;
  undoneAt?: string;
  createdAt: string;
}

export interface UndoResult {
  success: boolean;
  restoredPath: string;
  error?: string;
}

// ─── Action Log Types ──────────────────────────

export interface ActionLogEntry {
  id: string;
  personaId: string;
  tool: string;
  action: string;
  target?: string;
  contentPreview?: string;
  result: 'allowed' | 'denied' | 'confirmed' | 'undone';
  denyReason?: string;
  backupId?: string;
  createdAt: string;
}

// ─── Chat Types ────────────────────────────────

export interface ChatSession {
  id: string;
  personaId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  error?: string;
  createdAt: string;
}

// ─── User Preferences ──────────────────────────

export interface UserPreferences {
  id: string;
  userId: string;
  globalKeyboardShortcut: string;
  startOnLogin: boolean;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  backupRetentionDays: number;
  maxBackups: number;
}

// ─── Permission Memory ─────────────────────────

export interface PermissionMemoryEntry {
  id: string;
  personaId: string;
  tool: string;
  pathPattern: string;
  permission: 'allow_always' | 'block_always';
  expiresAt?: string;
  createdAt: string;
}

// ─── Electron API (exposed via preload) ────────

export interface ElectronAPI {
  auth: {
    getState: () => Promise<AuthState>;
    refresh: () => Promise<AuthState>;
    logout: () => Promise<void>;
    getToken: () => Promise<string | null>;
    storeToken: (token: string) => Promise<void>;
    clearToken: () => Promise<void>;
    onCallback: (callback: (result: AuthState) => void) => void;
  };
  db: {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
    run: (sql: string, params?: unknown[]) => Promise<unknown>;
    get: (sql: string, params?: unknown[]) => Promise<unknown>;
    all: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  };
  security: {
    evaluateAction: (request: ActionRequest) => Promise<ActionEvaluation>;
    confirmAction: (requestId: string, response: ConfirmationResponse) => Promise<void>;
    onConfirmRequest: (callback: (request: ConfirmationRequest) => void) => void;
  };
  agent: {
    sendMessage: (personaId: string, message: string) => Promise<void>;
    onResponse: (callback: (chunk: { personaId: string; content: string; done: boolean }) => void) => void;
    onToolCall: (callback: (toolCall: { personaId: string; tool: string; action: string }) => void) => void;
    stopGeneration: (personaId: string) => Promise<void>;
  };
  sync: {
    syncNow: () => Promise<void>;
    onSyncComplete: (callback: (result: { success: boolean; personaCount: number }) => void) => void;
    onPermissionEscalation: (callback: (escalation: PermissionEscalation) => void) => void;
  };
  backup: {
    undo: (backupId: string) => Promise<UndoResult>;
    getHistory: (personaId?: string) => Promise<ActionLogEntry[]>;
  };
  openclaw: {
    checkInstalled: () => Promise<boolean>;
    install: (apiKey: string, provider: string) => Promise<void>;
    onProgress: (cb: (pct: number) => void) => void;
  };
  window: {
    show: () => Promise<void>;
    hide: () => Promise<void>;
    isVisible: () => Promise<boolean>;
  };
  app: {
    getPath: (name: string) => Promise<string>;
    getVersion: () => Promise<string>;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  userId?: string;
  email?: string;
  accessToken?: string;
  error?: string;
}

export interface PermissionEscalation {
  personaId: string;
  personaName: string;
  changes: {
    newTools: string[];
    newPaths: PathPermission[];
    dangerousEnabled: boolean;
  };
}

// Augment the Window interface so TypeScript knows about electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
