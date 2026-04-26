/**
 * Database initialization for PersonaHub Desktop.
 *
 * This file does three things:
 * 1. Opens (or creates) the SQLite database file in the app's user data folder
 * 2. Runs the schema to create all tables (safe to re-run — uses IF NOT EXISTS)
 * 3. Registers TYPED IPC handlers so the renderer process can query the
 *    database through the preload bridge without ever executing raw SQL
 *    (previously db:query/run/get/all exposed the entire database to any
 *    code running in the renderer — see audit BLOCKER P1-2).
 */
import path from 'node:path';
import { EventEmitter } from 'node:events';
import Database from 'better-sqlite3';
import { LocalDB } from './local-db';
import { handleValidated } from '../electron/ipc-validation';
import type { UserPreferences, ChatMessage } from '../src/types';

/**
 * Pref-change bus. Other main-process modules subscribe to react to user
 * pref edits in real time — e.g. the globalShortcut re-registers when the
 * hotkey string changes, and setLoginItemSettings is called again when the
 * "Start on Login" toggle flips. Without this, prefs would only apply on
 * the NEXT app start (the pre-audit behavior).
 */
export const prefsBus = new EventEmitter();
export interface PrefsChangeEvent {
  updated: Partial<UserPreferences>;
  current: UserPreferences;
}

let localDB: LocalDB | null = null;

// SCHEMA — the single source of truth.
//
// Inlined (not loaded from a .sql file) because filesystem paths differ
// between dev and bundled builds, and the old schema.sql copy drifted
// out of sync (audit finding P4-E-3).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS persona_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT,
  system_prompt TEXT,
  chatflow_id TEXT,
  api_endpoint TEXT,
  status TEXT DEFAULT 'active',
  enabled_tools TEXT DEFAULT '[]',
  allowed_paths TEXT DEFAULT '[]',
  blocked_paths TEXT DEFAULT '[]',
  confirmation_level TEXT DEFAULT 'balanced',
  dangerous_tools_enabled INTEGER DEFAULT 0,
  activity_logging INTEGER DEFAULT 1,
  undo_enabled INTEGER DEFAULT 1,
  sandbox_enabled INTEGER DEFAULT 0,
  knowledge_base_refs TEXT DEFAULT '[]',
  settings TEXT DEFAULT '{}',
  synced_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS action_log_entries (
  id TEXT PRIMARY KEY,
  persona_id TEXT REFERENCES persona_configs(id),
  tool TEXT,
  action TEXT,
  target TEXT,
  content_preview TEXT,
  result TEXT,
  deny_reason TEXT,
  backup_id TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_action_log_persona_date
  ON action_log_entries(persona_id, created_at);

CREATE TABLE IF NOT EXISTS backup_records (
  id TEXT PRIMARY KEY,
  action_log_id TEXT REFERENCES action_log_entries(id),
  original_path TEXT,
  backup_path TEXT,
  action_type TEXT,
  file_existed INTEGER,
  undone INTEGER DEFAULT 0,
  undone_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  persona_id TEXT REFERENCES persona_configs(id),
  session_id TEXT,
  title TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id),
  role TEXT,
  content TEXT,
  is_streaming INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  global_keyboard_shortcut TEXT DEFAULT 'CmdOrCtrl+Shift+P',
  start_on_login INTEGER DEFAULT 1,
  notifications_enabled INTEGER DEFAULT 1,
  theme TEXT DEFAULT 'system',
  backup_retention_days INTEGER DEFAULT 30,
  max_backups INTEGER DEFAULT 1000
);

CREATE TABLE IF NOT EXISTS permission_memory (
  id TEXT PRIMARY KEY,
  persona_id TEXT REFERENCES persona_configs(id),
  tool TEXT,
  path_pattern TEXT,
  permission TEXT,
  expires_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  persona_id TEXT REFERENCES persona_configs(id),
  title TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size INTEGER,
  workspace_path TEXT,
  created_at TEXT
);
`;

/**
 * Ordered schema migrations. Append a new entry for every schema change —
 * never edit a published one (changing a migration mid-release would skip
 * it for users who already ran the original). The runner records each
 * applied version in `schema_migrations` so re-runs are idempotent.
 *
 * Use raw SQL — keep migrations tiny and readable. Reference: PRAGMA
 * user_version is intentionally NOT used because it can't carry per-row
 * metadata for forensics ("when was this run, by what version of the app?").
 */
interface Migration {
  version: number;
  description: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'add chat_sessions.title for session auto-titling',
    sql: 'ALTER TABLE chat_sessions ADD COLUMN title TEXT',
  },
  // future schema changes go here — append, never edit
];

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT,
      applied_at TEXT
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    const tx = db.transaction(() => {
      // The "duplicate column" / "already exists" path for users upgrading
      // from versions that ran the legacy try/catch ALTER. Swallow only
      // those specific error texts — anything else is a real problem.
      try {
        db.exec(m.sql);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const benign = /duplicate column|already exists/i.test(msg);
        if (!benign) throw err;
      }
      db.prepare(
        'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
      ).run(m.version, m.description, new Date().toISOString());
    });
    tx();
  }
}

/**
 * Initialize the database. Call this once during app startup.
 * @param userDataPath - Electron's app.getPath('userData'), e.g. ~/Library/Application Support/PersonaHub
 * @returns The initialized LocalDB instance
 */
export function initDatabase(userDataPath: string): LocalDB {
  // 1. Open or create the database file
  const dbPath = path.join(userDataPath, 'personahub.db');
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 2. Execute the schema (IF NOT EXISTS makes this safe to re-run)
  db.exec(SCHEMA);

  // 3. Run any pending migrations — the runner records what's applied so
  // subsequent runs are no-ops.
  runMigrations(db);

  // 4. Wrap in our typed layer
  localDB = new LocalDB(db);

  // 5. Register IPC handlers for renderer access
  registerIpcHandlers(localDB);

  return localDB;
}

/**
 * Get the current database instance (throws if not initialized).
 */
export function getDatabase(): LocalDB {
  if (!localDB) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return localDB;
}

/**
 * Register typed IPC handlers for renderer access. Each handler wraps a
 * specific LocalDB method — the renderer can never construct arbitrary SQL.
 * All handlers enforce sender validation via `handleValidated`.
 */
function registerIpcHandlers(localDB: LocalDB) {
  const { db } = localDB;

  // ── Chat ────────────────────────────────────────
  // Get-or-create the latest session for a persona (default entry point —
  // resumes the most recent conversation).
  handleValidated('chat:getOrCreateSession', (_event, personaId: string) => {
    const existing = localDB.getLatestChatSession(personaId);
    if (existing) return { sessionId: existing.id };
    const created = localDB.createChatSession(personaId);
    return { sessionId: created.id };
  });

  // Always create a NEW session for this persona. Used by the "+ New chat"
  // button in the chat header.
  handleValidated('chat:createSession', (_event, personaId: string) => {
    const created = localDB.createChatSession(personaId);
    return { sessionId: created.id };
  });

  // List all sessions for a persona, most recently updated first.
  handleValidated('chat:listSessions', (_event, personaId: string) => {
    return localDB.getChatSessionsByPersona(personaId);
  });

  // Rename a session (used by auto-title after first reply + user rename).
  handleValidated('chat:renameSession', (_event, sessionId: string, title: string) => {
    const trimmed = String(title ?? '').slice(0, 120).trim();
    if (!trimmed) return { ok: false };
    localDB.updateChatSessionTitle(sessionId, trimmed);
    return { ok: true };
  });

  // Delete a session (and cascade its messages).
  handleValidated('chat:deleteSession', (_event, sessionId: string) => {
    return localDB.deleteChatSession(sessionId);
  });

  // Load all messages for a session (in chronological order).
  handleValidated('chat:loadMessages', (_event, sessionId: string) => {
    return localDB.getChatMessagesBySession(sessionId);
  });

  // Insert a chat message (user or assistant).
  handleValidated('chat:saveMessage', (_event, msg: Omit<ChatMessage, 'id' | 'createdAt'> & { id?: string }) => {
    // If the caller provided a stable id (e.g. an assistant placeholder that
    // was created optimistically during streaming), honor it. Otherwise let
    // LocalDB generate one.
    if (msg.id) {
      db.prepare(`
        INSERT INTO chat_messages (id, session_id, role, content, is_streaming, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        msg.id,
        msg.sessionId,
        msg.role,
        msg.content,
        msg.isStreaming ? 1 : 0,
        msg.error ?? null,
        new Date().toISOString(),
      );
      db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), msg.sessionId);
      return { id: msg.id };
    }
    const saved = localDB.insertChatMessage(msg);
    return { id: saved.id };
  });

  // Get the most recent message for a persona (for sidebar preview).
  handleValidated('chat:getLastMessage', (_event, personaId: string) => {
    const row = db.prepare(`
      SELECT cm.content FROM chat_messages cm
      JOIN chat_sessions cs ON cm.session_id = cs.id
      WHERE cs.persona_id = ? ORDER BY cm.created_at DESC LIMIT 1
    `).get(personaId) as { content: string } | undefined;
    return row?.content ?? null;
  });

  // ── Sidebar (persona list with preview) ─────────
  // Returns lightweight persona rows for the sidebar — no sensitive fields.
  handleValidated('persona:sidebarList', () => {
    const rows = db.prepare(`
      SELECT id, name, settings FROM persona_configs
      WHERE status = 'active' ORDER BY name ASC
    `).all() as Array<{ id: string; name: string; settings: string | null }>;
    return rows;
  });

  // Ensure at least one persona exists (called at app startup).
  handleValidated('persona:ensureDefault', () => {
    const existing = db.prepare(
      `SELECT id FROM persona_configs WHERE status = 'active' LIMIT 1`,
    ).get() as { id: string } | undefined;
    if (existing) return { created: false };
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO persona_configs
        (id, name, system_prompt, status, confirmation_level, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'Assistant', 'You are a helpful AI assistant.', 'active', 'balanced', now, now);
    return { created: true, id };
  });

  // ── User preferences ────────────────────────────
  handleValidated('prefs:load', () => {
    // Single-user desktop app — always use the same row.
    return localDB.getOrCreatePreferences('default');
  });

  handleValidated('prefs:save', (_event, updates: Partial<Omit<UserPreferences, 'id' | 'userId'>>) => {
    const current = localDB.updatePreferences('default', updates);
    // Broadcast so main-process modules (shortcuts, login-item, theme
    // propagators, etc.) can react without requiring an app restart.
    prefsBus.emit('changed', { updated: updates, current } as PrefsChangeEvent);
    return current;
  });
}

/**
 * Close the database connection cleanly. Call during app shutdown.
 */
export function closeDatabase(): void {
  if (localDB) {
    localDB.db.close();
    localDB = null;
  }
}
