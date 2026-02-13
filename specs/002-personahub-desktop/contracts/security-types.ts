/**
 * Security Layer Contracts
 *
 * These types define the security system that sits between
 * the AI agent and the user's filesystem/tools.
 */

// ──────────────────────────────────────────────
// Tool Classification
// ──────────────────────────────────────────────

type ToolTier = 'safe' | 'guarded' | 'dangerous' | 'blocked';

interface ToolClassification {
  tool: string;
  tier: ToolTier;
  description: string;
}

// Hardcoded tool classifications
const TOOL_CLASSIFICATIONS: ToolClassification[] = [
  // Safe — no confirmation
  { tool: 'read', tier: 'safe', description: 'Read file contents' },
  { tool: 'ls', tier: 'safe', description: 'List directory' },
  { tool: 'web_search', tier: 'safe', description: 'Search the internet' },
  { tool: 'web_fetch', tier: 'safe', description: 'Fetch webpage content' },
  { tool: 'memory_search', tier: 'safe', description: 'Search knowledge base' },
  { tool: 'calendar.read', tier: 'safe', description: 'View calendar events' },
  { tool: 'weather', tier: 'safe', description: 'Get weather info' },

  // Guarded — requires confirmation
  { tool: 'write', tier: 'guarded', description: 'Write/create files' },
  { tool: 'edit', tier: 'guarded', description: 'Modify existing files' },
  { tool: 'exec', tier: 'guarded', description: 'Run shell commands' },
  { tool: 'browser.click', tier: 'guarded', description: 'Click web elements' },
  { tool: 'browser.type', tier: 'guarded', description: 'Type into web forms' },
  { tool: 'email.send', tier: 'guarded', description: 'Send emails' },
  { tool: 'calendar.create', tier: 'guarded', description: 'Create calendar events' },

  // Dangerous — requires explicit enable + confirmation
  { tool: 'delete', tier: 'dangerous', description: 'Delete files' },
  { tool: 'exec.sudo', tier: 'dangerous', description: 'Run as administrator' },
  { tool: 'system.shutdown', tier: 'dangerous', description: 'System control' },
  { tool: 'browser.download', tier: 'dangerous', description: 'Download files' },
  { tool: 'install', tier: 'dangerous', description: 'Install software' },
];

// ──────────────────────────────────────────────
// Blocked Paths (hardcoded, never overridable)
// ──────────────────────────────────────────────

const BLOCKED_PATH_PATTERNS: string[] = [
  '~/.ssh',
  '~/.aws',
  '~/.gnupg',
  '~/.config/gcloud',
  '~/Library/Keychains',
  '~/.password-store',
  '**/node_modules',
  '**/.git',
  '**/passwords*',
  '**/secrets*',
  '**/*.pem',
  '**/*.key',
  '**/credential*',
  '**/token*',
  // Windows equivalents
  '%USERPROFILE%/.ssh',
  '%APPDATA%/gcloud',
];

// ──────────────────────────────────────────────
// Action Guard — Request/Response
// ──────────────────────────────────────────────

interface ActionRequest {
  tool: string;
  action: string;
  target?: string;       // file path, URL, etc.
  content?: string;      // for file writes
  personaId: string;
}

type ActionResult = 'allow' | 'deny' | 'confirm';

interface ActionEvaluation {
  result: ActionResult;
  reason?: string;       // why denied or why confirmation needed
  tier: ToolTier;
}

// ──────────────────────────────────────────────
// Confirmation Dialog
// ──────────────────────────────────────────────

interface ConfirmationRequest {
  personaName: string;
  tool: string;
  action: string;
  target?: string;
  contentPreview?: string;  // first 500 chars
  tier: ToolTier;
}

type ConfirmationResponse =
  | { decision: 'allow_once' }
  | { decision: 'allow_always'; pathPattern: string }
  | { decision: 'deny' }
  | { decision: 'block' }
  | { decision: 'allow_once'; rememberMinutes: number };

// ──────────────────────────────────────────────
// Backup System
// ──────────────────────────────────────────────

interface BackupRecord {
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

interface UndoResult {
  success: boolean;
  restoredPath: string;
  error?: string;
}

export type {
  ToolTier,
  ToolClassification,
  ActionRequest,
  ActionResult,
  ActionEvaluation,
  ConfirmationRequest,
  ConfirmationResponse,
  BackupRecord,
  UndoResult,
};

export { TOOL_CLASSIFICATIONS, BLOCKED_PATH_PATTERNS };
