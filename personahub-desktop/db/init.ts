/**
 * Database initialization for PersonaHub Desktop.
 *
 * This file does three things:
 * 1. Opens (or creates) the SQLite database file in the app's user data folder
 * 2. Runs the schema to create all tables (safe to re-run — uses IF NOT EXISTS)
 * 3. Registers IPC handlers so the renderer process can query the database
 *    through the preload bridge (window.electronAPI.db.*)
 */
import path from 'node:path';
import Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { LocalDB } from './local-db';

let localDB: LocalDB | null = null;

// Schema inlined to avoid filesystem path issues in bundled builds.
// The original lives in db/schema.sql for reference.
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

  // 3. Wrap in our typed layer
  localDB = new LocalDB(db);

  // 4. Register IPC handlers for renderer access
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
 * Register IPC handlers so the React renderer can run database queries
 * through the preload bridge. These map to window.electronAPI.db.* calls.
 */
function registerIpcHandlers(localDB: LocalDB) {
  const { db } = localDB;

  // db:run — for INSERT/UPDATE/DELETE statements
  ipcMain.handle('db:run', (_event, sql: string, params?: unknown[]) => {
    const stmt = db.prepare(sql);
    return stmt.run(...(params ?? []));
  });

  // db:get — returns a single row
  ipcMain.handle('db:get', (_event, sql: string, params?: unknown[]) => {
    const stmt = db.prepare(sql);
    return stmt.get(...(params ?? []));
  });

  // db:all — returns all matching rows
  ipcMain.handle('db:all', (_event, sql: string, params?: unknown[]) => {
    const stmt = db.prepare(sql);
    return stmt.all(...(params ?? []));
  });

  // db:query — alias for db:all (kept for API compatibility)
  ipcMain.handle('db:query', (_event, sql: string, params?: unknown[]) => {
    const stmt = db.prepare(sql);
    return stmt.all(...(params ?? []));
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
