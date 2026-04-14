/**
 * Typed SQLite database wrapper for PersonaHub Desktop.
 *
 * Think of this as the "data access layer" — every other part of the app
 * talks to the database through these functions instead of writing raw SQL.
 * That keeps SQL in one place and gives us type safety everywhere else.
 */
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  PersonaConfig,
  ActionLogEntry,
  BackupRecord,
  ChatSession,
  ChatMessage,
  UserPreferences,
  PermissionMemoryEntry,
  KnowledgeDocument,
} from '../src/types/index';

// ─── Helpers ────────────────────────────────────────

/** The raw row shape SQLite returns for persona_configs (snake_case + integers for booleans). */
interface PersonaRow {
  id: string;
  user_id: string;
  name: string;
  system_prompt: string;
  chatflow_id: string;
  api_endpoint: string;
  status: string;
  enabled_tools: string;
  allowed_paths: string;
  blocked_paths: string;
  confirmation_level: string;
  dangerous_tools_enabled: number;
  activity_logging: number;
  undo_enabled: number;
  sandbox_enabled: number;
  knowledge_base_refs: string;
  settings: string;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Parse JSON safely, returning a fallback on any error. A single corrupted
 * JSON cell was previously enough to crash `getAllPersonas()` via unhandled
 * `JSON.parse` throws (audit finding P3-C-2).
 */
function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (err) {
    console.warn('[local-db] Corrupted JSON in DB row, using fallback:', err);
    return fallback;
  }
}

function rowToPersona(row: PersonaRow): PersonaConfig {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    systemPrompt: row.system_prompt,
    chatflowId: row.chatflow_id,
    apiEndpoint: row.api_endpoint,
    status: row.status as PersonaConfig['status'],
    enabledTools: safeJsonParse(row.enabled_tools, [] as string[]),
    allowedPaths: safeJsonParse(row.allowed_paths, [] as PersonaConfig['allowedPaths']),
    blockedPaths: safeJsonParse(row.blocked_paths, [] as string[]),
    confirmationLevel: row.confirmation_level as PersonaConfig['confirmationLevel'],
    dangerousToolsEnabled: row.dangerous_tools_enabled === 1,
    activityLogging: row.activity_logging === 1,
    undoEnabled: row.undo_enabled === 1,
    sandboxEnabled: row.sandbox_enabled === 1,
    knowledgeBaseRefs: safeJsonParse(row.knowledge_base_refs, [] as PersonaConfig['knowledgeBaseRefs']),
    settings: safeJsonParse(row.settings, {} as PersonaConfig['settings']),
    syncedAt: row.synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ActionLogRow {
  id: string;
  persona_id: string;
  tool: string;
  action: string;
  target: string | null;
  content_preview: string | null;
  result: string;
  deny_reason: string | null;
  backup_id: string | null;
  created_at: string;
}

function rowToActionLog(row: ActionLogRow): ActionLogEntry {
  return {
    id: row.id,
    personaId: row.persona_id,
    tool: row.tool,
    action: row.action,
    target: row.target ?? undefined,
    contentPreview: row.content_preview ?? undefined,
    result: row.result as ActionLogEntry['result'],
    denyReason: row.deny_reason ?? undefined,
    backupId: row.backup_id ?? undefined,
    createdAt: row.created_at,
  };
}

interface BackupRow {
  id: string;
  action_log_id: string;
  original_path: string;
  backup_path: string;
  action_type: string;
  file_existed: number;
  undone: number;
  undone_at: string | null;
  created_at: string;
}

function rowToBackup(row: BackupRow): BackupRecord {
  return {
    id: row.id,
    actionLogId: row.action_log_id,
    originalPath: row.original_path,
    backupPath: row.backup_path,
    actionType: row.action_type as BackupRecord['actionType'],
    fileExisted: row.file_existed === 1,
    undone: row.undone === 1,
    undoneAt: row.undone_at ?? undefined,
    createdAt: row.created_at,
  };
}

interface ChatSessionRow {
  id: string;
  persona_id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
}

function rowToSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    personaId: row.persona_id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ChatMessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  is_streaming: number;
  error: string | null;
  created_at: string;
}

function rowToMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as ChatMessage['role'],
    content: row.content,
    isStreaming: row.is_streaming === 1,
    error: row.error ?? undefined,
    createdAt: row.created_at,
  };
}

interface UserPreferencesRow {
  id: string;
  user_id: string;
  global_keyboard_shortcut: string;
  start_on_login: number;
  notifications_enabled: number;
  theme: string;
  backup_retention_days: number;
  max_backups: number;
}

function rowToPreferences(row: UserPreferencesRow): UserPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    globalKeyboardShortcut: row.global_keyboard_shortcut,
    startOnLogin: row.start_on_login === 1,
    notificationsEnabled: row.notifications_enabled === 1,
    theme: row.theme as UserPreferences['theme'],
    backupRetentionDays: row.backup_retention_days,
    maxBackups: row.max_backups,
  };
}

interface PermissionRow {
  id: string;
  persona_id: string;
  tool: string;
  path_pattern: string;
  permission: string;
  expires_at: string | null;
  created_at: string;
}

function rowToPermission(row: PermissionRow): PermissionMemoryEntry {
  return {
    id: row.id,
    personaId: row.persona_id,
    tool: row.tool,
    pathPattern: row.path_pattern,
    permission: row.permission as PermissionMemoryEntry['permission'],
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
  };
}

interface KnowledgeDocRow {
  id: string;
  persona_id: string;
  title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  workspace_path: string;
  created_at: string;
}

function rowToKnowledgeDoc(row: KnowledgeDocRow): KnowledgeDocument {
  return {
    id: row.id,
    personaId: row.persona_id,
    title: row.title,
    fileName: row.file_name,
    fileType: row.file_type as KnowledgeDocument['fileType'],
    fileSize: row.file_size,
    workspacePath: row.workspace_path,
    createdAt: row.created_at,
  };
}

// ─── Database Class ─────────────────────────────────

export class LocalDB {
  constructor(public db: Database.Database) {}

  // ── PersonaConfig ───────────────────────────────

  upsertPersona(persona: PersonaConfig): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO persona_configs (
        id, user_id, name, system_prompt, chatflow_id, api_endpoint,
        status, enabled_tools, allowed_paths, blocked_paths,
        confirmation_level, dangerous_tools_enabled, activity_logging,
        undo_enabled, sandbox_enabled, knowledge_base_refs, settings,
        synced_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        name = excluded.name,
        system_prompt = excluded.system_prompt,
        chatflow_id = excluded.chatflow_id,
        api_endpoint = excluded.api_endpoint,
        status = excluded.status,
        enabled_tools = excluded.enabled_tools,
        allowed_paths = excluded.allowed_paths,
        blocked_paths = excluded.blocked_paths,
        confirmation_level = excluded.confirmation_level,
        dangerous_tools_enabled = excluded.dangerous_tools_enabled,
        activity_logging = excluded.activity_logging,
        undo_enabled = excluded.undo_enabled,
        sandbox_enabled = excluded.sandbox_enabled,
        knowledge_base_refs = excluded.knowledge_base_refs,
        settings = excluded.settings,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at
    `).run(
      persona.id,
      persona.userId,
      persona.name,
      persona.systemPrompt,
      persona.chatflowId,
      persona.apiEndpoint,
      persona.status,
      JSON.stringify(persona.enabledTools),
      JSON.stringify(persona.allowedPaths),
      JSON.stringify(persona.blockedPaths),
      persona.confirmationLevel,
      persona.dangerousToolsEnabled ? 1 : 0,
      persona.activityLogging ? 1 : 0,
      persona.undoEnabled ? 1 : 0,
      persona.sandboxEnabled ? 1 : 0,
      JSON.stringify(persona.knowledgeBaseRefs),
      JSON.stringify(persona.settings),
      persona.syncedAt ?? now,
      persona.createdAt ?? now,
      persona.updatedAt ?? now,
    );
  }

  getPersonaById(id: string): PersonaConfig | undefined {
    const row = this.db.prepare('SELECT * FROM persona_configs WHERE id = ?').get(id) as PersonaRow | undefined;
    return row ? rowToPersona(row) : undefined;
  }

  getAllPersonas(): PersonaConfig[] {
    const rows = this.db.prepare('SELECT * FROM persona_configs ORDER BY created_at DESC').all() as PersonaRow[];
    return rows.map(rowToPersona);
  }

  getActivePersonas(): PersonaConfig[] {
    const rows = this.db.prepare("SELECT * FROM persona_configs WHERE status = 'active' ORDER BY name").all() as PersonaRow[];
    return rows.map(rowToPersona);
  }

  deletePersona(id: string): void {
    this.db.prepare('DELETE FROM persona_configs WHERE id = ?').run(id);
  }

  // ── ActionLogEntry ──────────────────────────────

  insertActionLog(entry: Omit<ActionLogEntry, 'id' | 'createdAt'>): ActionLogEntry {
    const id = uuid();
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO action_log_entries (id, persona_id, tool, action, target, content_preview, result, deny_reason, backup_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, entry.personaId, entry.tool, entry.action, entry.target ?? null, entry.contentPreview ?? null, entry.result, entry.denyReason ?? null, entry.backupId ?? null, createdAt);
    return { ...entry, id, createdAt };
  }

  getActionLogsByPersona(personaId: string, limit = 100): ActionLogEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM action_log_entries WHERE persona_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(personaId, limit) as ActionLogRow[];
    return rows.map(rowToActionLog);
  }

  getAllActionLogs(opts?: { tool?: string; result?: string; limit?: number }): ActionLogEntry[] {
    let sql = 'SELECT * FROM action_log_entries WHERE 1=1';
    const params: unknown[] = [];
    if (opts?.tool) { sql += ' AND tool = ?'; params.push(opts.tool); }
    if (opts?.result) { sql += ' AND result = ?'; params.push(opts.result); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(opts?.limit ?? 100);
    const rows = this.db.prepare(sql).all(...params) as ActionLogRow[];
    return rows.map(rowToActionLog);
  }

  updateActionLogResult(id: string, result: ActionLogEntry['result']): void {
    this.db.prepare('UPDATE action_log_entries SET result = ? WHERE id = ?').run(result, id);
  }

  // ── BackupRecord ────────────────────────────────

  insertBackup(record: Omit<BackupRecord, 'id' | 'undone' | 'undoneAt' | 'createdAt'>): BackupRecord {
    const id = uuid();
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO backup_records (id, action_log_id, original_path, backup_path, action_type, file_existed, undone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, record.actionLogId, record.originalPath, record.backupPath, record.actionType, record.fileExisted ? 1 : 0, createdAt);
    return { ...record, id, undone: false, createdAt };
  }

  getBackupById(id: string): BackupRecord | undefined {
    const row = this.db.prepare('SELECT * FROM backup_records WHERE id = ?').get(id) as BackupRow | undefined;
    return row ? rowToBackup(row) : undefined;
  }

  getBackupByActionLogId(actionLogId: string): BackupRecord | undefined {
    const row = this.db.prepare('SELECT * FROM backup_records WHERE action_log_id = ?').get(actionLogId) as BackupRow | undefined;
    return row ? rowToBackup(row) : undefined;
  }

  markBackupUndone(id: string): void {
    this.db.prepare('UPDATE backup_records SET undone = 1, undone_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  }

  getOldestBackups(limit: number): BackupRecord[] {
    const rows = this.db.prepare('SELECT * FROM backup_records WHERE undone = 0 ORDER BY created_at ASC LIMIT ?').all(limit) as BackupRow[];
    return rows.map(rowToBackup);
  }

  getBackupCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM backup_records WHERE undone = 0').get() as { count: number };
    return row.count;
  }

  deleteOldestBackups(count: number): void {
    this.db.prepare(`
      DELETE FROM backup_records WHERE id IN (
        SELECT id FROM backup_records WHERE undone = 0 ORDER BY created_at ASC LIMIT ?
      )
    `).run(count);
  }

  // ── ChatSession ─────────────────────────────────

  createChatSession(personaId: string): ChatSession {
    const id = uuid();
    const sessionId = uuid();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO chat_sessions (id, persona_id, session_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, personaId, sessionId, now, now);
    return { id, personaId, sessionId, createdAt: now, updatedAt: now };
  }

  getChatSessionsByPersona(personaId: string): ChatSession[] {
    const rows = this.db.prepare('SELECT * FROM chat_sessions WHERE persona_id = ? ORDER BY updated_at DESC').all(personaId) as ChatSessionRow[];
    return rows.map(rowToSession);
  }

  getLatestChatSession(personaId: string): ChatSession | undefined {
    const row = this.db.prepare('SELECT * FROM chat_sessions WHERE persona_id = ? ORDER BY updated_at DESC LIMIT 1').get(personaId) as ChatSessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  // ── ChatMessage ─────────────────────────────────

  insertChatMessage(msg: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage {
    const id = uuid();
    const createdAt = new Date().toISOString();
    // Wrap the two writes in a transaction so a crash between statements
    // can't leave the session's updated_at stale relative to its messages
    // (audit finding P3-C-1).
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO chat_messages (id, session_id, role, content, is_streaming, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, msg.sessionId, msg.role, msg.content, msg.isStreaming ? 1 : 0, msg.error ?? null, createdAt);
      this.db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(createdAt, msg.sessionId);
    })();
    return { ...msg, id, createdAt };
  }

  getChatMessagesBySession(sessionId: string): ChatMessage[] {
    const rows = this.db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as ChatMessageRow[];
    return rows.map(rowToMessage);
  }

  updateMessageStreaming(id: string, content: string, isStreaming: boolean): void {
    this.db.prepare('UPDATE chat_messages SET content = ?, is_streaming = ? WHERE id = ?').run(content, isStreaming ? 1 : 0, id);
  }

  // ── UserPreferences ─────────────────────────────

  getOrCreatePreferences(userId: string): UserPreferences {
    const existing = this.db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as UserPreferencesRow | undefined;
    if (existing) return rowToPreferences(existing);

    const id = uuid();
    this.db.prepare(`
      INSERT INTO user_preferences (id, user_id) VALUES (?, ?)
    `).run(id, userId);

    const row = this.db.prepare('SELECT * FROM user_preferences WHERE id = ?').get(id) as UserPreferencesRow;
    return rowToPreferences(row);
  }

  updatePreferences(userId: string, updates: Partial<Omit<UserPreferences, 'id' | 'userId'>>): UserPreferences {
    // Build SET clause dynamically from the provided fields
    const fieldMap: Record<string, string> = {
      globalKeyboardShortcut: 'global_keyboard_shortcut',
      startOnLogin: 'start_on_login',
      notificationsEnabled: 'notifications_enabled',
      theme: 'theme',
      backupRetentionDays: 'backup_retention_days',
      maxBackups: 'max_backups',
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in updates) {
        setClauses.push(`${col} = ?`);
        const val = (updates as Record<string, unknown>)[key];
        params.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
      }
    }

    if (setClauses.length > 0) {
      params.push(userId);
      this.db.prepare(`UPDATE user_preferences SET ${setClauses.join(', ')} WHERE user_id = ?`).run(...params);
    }

    return this.getOrCreatePreferences(userId);
  }

  // ── PermissionMemory ────────────────────────────

  insertPermission(entry: Omit<PermissionMemoryEntry, 'id' | 'createdAt'>): PermissionMemoryEntry {
    const id = uuid();
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO permission_memory (id, persona_id, tool, path_pattern, permission, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, entry.personaId, entry.tool, entry.pathPattern, entry.permission, entry.expiresAt ?? null, createdAt);
    return { ...entry, id, createdAt };
  }

  findPermission(personaId: string, tool: string, path: string): PermissionMemoryEntry | undefined {
    // Find a matching permission where the path starts with the stored pattern
    const rows = this.db.prepare(`
      SELECT * FROM permission_memory
      WHERE persona_id = ? AND tool = ?
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC
    `).all(personaId, tool, new Date().toISOString()) as PermissionRow[];

    // Check each stored pattern against the requested path
    for (const row of rows) {
      if (path.startsWith(row.path_pattern) || row.path_pattern === '*') {
        return rowToPermission(row);
      }
    }
    return undefined;
  }

  deleteExpiredPermissions(): number {
    const result = this.db.prepare(
      'DELETE FROM permission_memory WHERE expires_at IS NOT NULL AND expires_at <= ?'
    ).run(new Date().toISOString());
    return result.changes;
  }

  // ── KnowledgeDocument ──────────────────────────────

  insertKnowledgeDoc(doc: KnowledgeDocument): void {
    this.db.prepare(`
      INSERT INTO knowledge_documents (id, persona_id, title, file_name, file_type, file_size, workspace_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(doc.id, doc.personaId, doc.title, doc.fileName, doc.fileType, doc.fileSize, doc.workspacePath, doc.createdAt);
  }

  getKnowledgeDocs(personaId: string): KnowledgeDocument[] {
    const rows = this.db.prepare(
      'SELECT * FROM knowledge_documents WHERE persona_id = ? ORDER BY created_at DESC'
    ).all(personaId) as KnowledgeDocRow[];
    return rows.map(rowToKnowledgeDoc);
  }

  deleteKnowledgeDoc(id: string): KnowledgeDocument | undefined {
    const row = this.db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(id) as KnowledgeDocRow | undefined;
    if (!row) return undefined;
    this.db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id);
    return rowToKnowledgeDoc(row);
  }
}
