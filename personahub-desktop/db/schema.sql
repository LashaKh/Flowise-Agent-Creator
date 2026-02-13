-- PersonaHub Desktop — Local SQLite Schema
-- All tables use IF NOT EXISTS so the schema can be re-run safely.

-- 1. Persona configs cached from the web platform
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

-- 2. Every tool invocation is logged here
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

-- 3. File backups for undo support
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

-- 4. Chat sessions (one conversation per persona)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  persona_id TEXT REFERENCES persona_configs(id),
  session_id TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 5. Individual chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id),
  role TEXT,
  content TEXT,
  is_streaming INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT
);

-- 6. App-level user preferences (one row per user)
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

-- 7. Remembered "Allow Always" / "Block Always" choices
CREATE TABLE IF NOT EXISTS permission_memory (
  id TEXT PRIMARY KEY,
  persona_id TEXT REFERENCES persona_configs(id),
  tool TEXT,
  path_pattern TEXT,
  permission TEXT,
  expires_at TEXT,
  created_at TEXT
);
