/**
 * Application Types
 * Re-exports all types used throughout the application
 */

// Persona Settings stored in JSONB
export interface PersonaSettings {
  temperature?: number;
  modelName?: string;
  customInstructions?: string;
}

// Persona status enum
export type PersonaStatus = 'creating' | 'active' | 'failed' | 'deleted';

// Database row type (matches Supabase generated types)
export interface PersonaRow {
  id: string;
  user_id: string;
  name: string;
  chatflow_id: string;
  system_prompt: string;
  api_endpoint: string;
  settings: PersonaSettings;
  status: PersonaStatus;
  error_message: string | null;
  enabled_tools: string[];
  allowed_paths: Array<{ path: string; mode: 'read' | 'readwrite' }>;
  confirmation_level: string;
  dangerous_tools_enabled: boolean;
  activity_logging: boolean;
  undo_enabled: boolean;
  sandbox_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// API response type for frontend
export interface Persona {
  id: string;
  name: string;
  chatflowId: string;
  systemPrompt: string;
  apiEndpoint: string;
  settings: PersonaSettings;
  status: PersonaStatus;
  errorMessage: string | null;
  enabledTools: string[];
  allowedPaths: Array<{ path: string; mode: 'read' | 'readwrite' }>;
  confirmationLevel: string;
  dangerousToolsEnabled: boolean;
  activityLogging: boolean;
  undoEnabled: boolean;
  sandboxEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Permission configuration for desktop personas
export interface PermissionConfigValue {
  enabledTools: string[];
  allowedPaths: Array<{ path: string; mode: 'read' | 'readwrite' }>;
  confirmationLevel: 'paranoid' | 'balanced' | 'relaxed' | 'trust';
  dangerousToolsEnabled: boolean;
  activityLogging: boolean;
  undoEnabled: boolean;
  sandboxEnabled: boolean;
}

export const DEFAULT_PERMISSIONS: PermissionConfigValue = {
  enabledTools: ['read', 'ls', 'web_search', 'memory_search'],
  allowedPaths: [],
  confirmationLevel: 'balanced',
  dangerousToolsEnabled: false,
  activityLogging: true,
  undoEnabled: true,
  sandboxEnabled: false,
};

// Create persona request
export interface CreatePersonaRequest {
  name: string;
  permissions?: PermissionConfigValue;
}

// Update persona request
export interface UpdatePersonaRequest {
  systemPrompt?: string;
  settings?: Partial<PersonaSettings>;
  permissions?: Partial<PermissionConfigValue>;
}

// API Response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Transform PersonaRow to Persona
export function transformPersonaRow(row: PersonaRow): Persona {
  return {
    id: row.id,
    name: row.name,
    chatflowId: row.chatflow_id,
    systemPrompt: row.system_prompt,
    apiEndpoint: row.api_endpoint,
    settings: row.settings,
    status: row.status,
    errorMessage: row.error_message,
    enabledTools: row.enabled_tools ?? DEFAULT_PERMISSIONS.enabledTools,
    allowedPaths: row.allowed_paths ?? DEFAULT_PERMISSIONS.allowedPaths,
    confirmationLevel: row.confirmation_level ?? DEFAULT_PERMISSIONS.confirmationLevel,
    dangerousToolsEnabled: row.dangerous_tools_enabled ?? DEFAULT_PERMISSIONS.dangerousToolsEnabled,
    activityLogging: row.activity_logging ?? DEFAULT_PERMISSIONS.activityLogging,
    undoEnabled: row.undo_enabled ?? DEFAULT_PERMISSIONS.undoEnabled,
    sandboxEnabled: row.sandbox_enabled ?? DEFAULT_PERMISSIONS.sandboxEnabled,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Chat message in conversation
export interface ChatMessage {
  id: string;                    // UUID for React key
  role: 'user' | 'assistant';   // Message sender
  content: string;              // Message text
  timestamp: Date;              // When message was sent/received
  isStreaming?: boolean;        // True while assistant response is streaming
  error?: string;               // Error message if send failed
}

// Chat state (React component state)
export interface ChatState {
  selectedPersonaId: string | null;  // Currently selected persona
  messages: ChatMessage[];           // Conversation history (session-only)
  isLoading: boolean;                // True while waiting for response
  retryCount: number;                // Current retry attempt (0-3)
  lastFailedMessage?: string;        // Message to retry on manual retry
}
