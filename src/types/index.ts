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
  createdAt: Date;
  updatedAt: Date;
}

// Create persona request
export interface CreatePersonaRequest {
  name: string;
}

// Update persona request
export interface UpdatePersonaRequest {
  systemPrompt?: string;
  settings?: Partial<PersonaSettings>;
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
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
