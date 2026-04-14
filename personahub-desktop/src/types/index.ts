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

export type VoiceProvider = 'auto' | 'cloud-openai' | 'cloud-elevenlabs' | 'cloud-google' | 'os-native' | 'local-only';

export interface PersonaSettings {
  temperature?: number;
  modelName?: string;
  customInstructions?: string;
  avatar?: string;
  pinned?: boolean;
  // Voice & Avatar (Phase 3) — all optional, inherit from GlobalVoicePrefs when absent
  voiceEnabled?: boolean;
  voiceProvider?: VoiceProvider;
  voiceId?: string;
  voiceSpeed?: number;
  avatarEnabled?: boolean;
  avatarStyleId?: string;
  avatarAccentHue?: number;
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

export interface KnowledgeDocument {
  id: string;
  personaId: string;
  title: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'txt' | 'md';
  fileSize: number;
  workspacePath: string;
  createdAt: string;
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
    signIn: (email: string, password: string) => Promise<AuthState>;
    refresh: () => Promise<AuthState>;
    logout: () => Promise<void>;
    getToken: () => Promise<string | null>;
    storeToken: (token: string) => Promise<void>;
    clearToken: () => Promise<void>;
    onCallback: (callback: (result: AuthState) => void) => () => void;
  };
  // Typed chat operations — no raw SQL exposed.
  chat: {
    getOrCreateSession: (personaId: string) => Promise<{ sessionId: string }>;
    loadMessages: (sessionId: string) => Promise<ChatMessage[]>;
    saveMessage: (msg: Omit<ChatMessage, 'createdAt'>) => Promise<{ id: string }>;
    getLastMessage: (personaId: string) => Promise<string | null>;
  };
  // Typed preferences (single-user desktop app).
  prefs: {
    load: () => Promise<UserPreferences>;
    save: (updates: Partial<Omit<UserPreferences, 'id' | 'userId'>>) => Promise<UserPreferences>;
  };
  security: {
    evaluateAction: (request: ActionRequest) => Promise<ActionEvaluation>;
    confirmAction: (requestId: string, response: ConfirmationResponse) => Promise<void>;
    onConfirmRequest: (callback: (request: ConfirmationRequest) => void) => () => void;
  };
  agent: {
    sendMessage: (personaId: string, message: string) => Promise<void>;
    createPersona: (name: string, description: string, options?: { temperature?: number; confirmationLevel?: string; modelName?: string }) => Promise<{ id: string; name: string; systemPrompt: string }>;
    listPersonas: () => Promise<PersonaConfig[]>;
    sidebarList: () => Promise<Array<{ id: string; name: string; settings: string | null }>>;
    ensureDefault: () => Promise<{ created: boolean; id?: string }>;
    getPersona: (id: string) => Promise<PersonaConfig | null>;
    updatePersona: (id: string, updates: Partial<Pick<PersonaConfig, 'name' | 'systemPrompt' | 'confirmationLevel' | 'enabledTools' | 'allowedPaths'> & { settings: Partial<PersonaSettings> }>) => Promise<PersonaConfig>;
    deletePersona: (id: string) => Promise<void>;
    duplicatePersona: (id: string) => Promise<{ id: string; name: string }>;
    regeneratePrompt: (id: string) => Promise<{ systemPrompt: string }>;
    clearHistory: (personaId: string) => Promise<void>;
    exportPersona: (id: string) => Promise<string>;
    importPersona: (json: string) => Promise<{ id: string; name: string }>;
    getStats: (personaId: string) => Promise<{ messageCount: number; lastActiveAt: string | null }>;
    onResponse: (callback: (chunk: { personaId: string; content: string; done: boolean }) => void) => () => void;
    onToolCall: (callback: (toolCall: { personaId: string; tool: string; action: string }) => void) => () => void;
    stopGeneration: (personaId: string) => Promise<void>;
    uploadKnowledgeDoc: (personaId: string) => Promise<KnowledgeDocument | null>;
    listKnowledgeDocs: (personaId: string) => Promise<KnowledgeDocument[]>;
    deleteKnowledgeDoc: (docId: string) => Promise<void>;
  };
  sync: {
    syncNow: () => Promise<void>;
    onSyncComplete: (callback: (result: { success: boolean; personaCount: number }) => void) => () => void;
    onPermissionEscalation: (callback: (escalation: PermissionEscalation) => void) => () => void;
  };
  backup: {
    undo: (backupId: string) => Promise<UndoResult>;
    getHistory: (personaId?: string) => Promise<ActionLogEntry[]>;
  };
  openclaw: {
    checkInstalled: () => Promise<boolean>;
    install: (apiKey: string, provider: string) => Promise<void>;
    detectExisting: () => Promise<{
      provider: 'anthropic' | 'google' | null;
      keyPreview: string | null;
    }>;
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
  // Voice & Avatar (Phase 3)
  tts: {
    synthesize: (text: string, voiceId: string, provider: string, personaId: string) => Promise<ArrayBuffer>;
  };
  stt: {
    transcribe: (audio: ArrayBuffer, mimeType: string) => Promise<{ text: string }>;
  };
  voice: {
    storeKey: (providerId: string, apiKey: string) => Promise<boolean>;
    getKey: (providerId: string) => Promise<string | null>;
    hasKey: (providerId: string) => Promise<boolean>;
    deleteKey: (providerId: string) => Promise<boolean>;
    getPrefs: () => Promise<GlobalVoicePrefs>;
    setPrefs: (prefs: Partial<GlobalVoicePrefs>) => Promise<void>;
    runDiagnostics: () => Promise<DiagnosticResult[]>;
  };
  // LLM usage stats (for the Settings → AI cost dashboard)
  llm: {
    getUsage: () => Promise<{
      totalCostUsd: number;
      totalTokens: number;
      totalRequests: number;
      perModel: Record<string, { costUsd: number; tokens: number; requests: number }>;
    }>;
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

// ─── Voice & Avatar Types ─────────────────────

export type AvatarStyleId = 'face-warm' | 'face-cool' | 'face-playful' | 'face-serious' | 'face-gentle' | 'face-bold';

export interface GlobalVoicePrefs {
  voiceOutputEnabled: boolean;
  voiceInputEnabled: boolean;
  defaultProvider: VoiceProvider;
  defaultVoiceId?: string;
  defaultAvatarStyle: AvatarStyleId;
  captionsEnabled: boolean;
  reducedMotionOverride: 'auto' | 'always' | 'never';
  localOnlyMode: boolean;
  autoStopOnBlur: boolean;
  monthlySpendCeiling: Record<string, number>;
  featureFlag: boolean;
  /** Voice speed multiplier (0.5x – 2.0x). Default 1.0. */
  defaultSpeed?: number;
}

export interface DiagnosticResult {
  stage: 'secure-store' | 'gateway' | 'cloud-openai' | 'cloud-elevenlabs' | 'cloud-google' | 'os-voices' | 'microphone' | 'stt-model';
  status: 'pass' | 'fail' | 'skip';
  errorCode?: string;
  errorMessage?: string;
}

export type VoiceSessionState = 'idle' | 'queued' | 'synthesizing' | 'playing' | 'interrupted' | 'completed' | 'error';

export type AvatarState = 'idle' | 'thinking' | 'speaking' | 'listening' | 'error' | 'initializing';

// Augment the Window interface so TypeScript knows about electronAPI
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
