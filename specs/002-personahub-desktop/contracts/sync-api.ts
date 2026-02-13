/**
 * Sync API Contracts
 *
 * These contracts define the API between the desktop app and the web platform.
 * The desktop app calls these endpoints to sync persona configs and knowledge base.
 */

// ──────────────────────────────────────────────
// GET /functions/v1/personas
// Desktop app polls this every 30 seconds
// ──────────────────────────────────────────────

interface SyncPersonasResponse {
  personas: PersonaConfig[];
}

interface PersonaConfig {
  id: string;
  name: string;
  chatflowId: string;
  systemPrompt: string;
  apiEndpoint: string;
  status: 'creating' | 'active' | 'failed' | 'deleted';
  settings: PersonaSettings;

  // New fields for desktop permissions
  enabledTools: string[];
  allowedPaths: PathPermission[];
  confirmationLevel: 'paranoid' | 'balanced' | 'relaxed' | 'trust';
  dangerousToolsEnabled: boolean;
  activityLogging: boolean;
  undoEnabled: boolean;
  sandboxEnabled: boolean;
  knowledgeBaseRefs: KnowledgeBaseRef[];

  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

interface PersonaSettings {
  temperature?: number;
  modelName?: string;
  customInstructions?: string;
}

interface PathPermission {
  path: string;          // e.g. "~/Documents"
  mode: 'read' | 'readwrite';
}

interface KnowledgeBaseRef {
  docId: string;
  title: string;
  updatedAt: string;     // ISO 8601 — used to detect changes
}

// ──────────────────────────────────────────────
// GET /functions/v1/knowledge-base?persona={personaId}
// Downloads KB documents for offline access
// ──────────────────────────────────────────────

interface KnowledgeBaseResponse {
  documents: KnowledgeBaseDocument[];
}

interface KnowledgeBaseDocument {
  id: string;
  title: string;
  content: string;       // Markdown content
  updatedAt: string;     // ISO 8601
}

// ──────────────────────────────────────────────
// PATCH /functions/v1/personas/:id
// Desktop app sends permission escalation approval back to web
// (Confirms user accepted new permissions locally)
// ──────────────────────────────────────────────

interface PermissionAcknowledgement {
  acknowledgedPermissions: {
    enabledTools: string[];
    allowedPaths: PathPermission[];
    dangerousToolsEnabled: boolean;
  };
  acknowledgedAt: string; // ISO 8601
}

// ──────────────────────────────────────────────
// Auth: Custom Protocol Handler
// Desktop app registers personahub://auth/callback
// ──────────────────────────────────────────────

// Step 1: Desktop opens browser to:
// https://wlvfilxtvqjzwqjhfcdk.supabase.co/auth/v1/authorize
//   ?provider=google
//   &redirect_to=personahub://auth/callback
//   &code_challenge={pkceChallenge}
//   &code_challenge_method=S256

// Step 2: After Google OAuth, browser redirects to:
// personahub://auth/callback?code={authCode}

// Step 3: Desktop exchanges code for session:
// POST https://wlvfilxtvqjzwqjhfcdk.supabase.co/auth/v1/token
//   ?grant_type=pkce
//   &code={authCode}
//   &code_verifier={pkceVerifier}

interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'bearer';
  user: {
    id: string;
    email: string;
  };
}

export type {
  SyncPersonasResponse,
  PersonaConfig,
  PersonaSettings,
  PathPermission,
  KnowledgeBaseRef,
  KnowledgeBaseResponse,
  KnowledgeBaseDocument,
  PermissionAcknowledgement,
  AuthTokenResponse,
};
