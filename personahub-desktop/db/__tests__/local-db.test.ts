/**
 * local-db cascade-delete + basic CRUD tests — QA finding UT2 + INT4.
 *
 * Uses better-sqlite3 in-memory mode so the real schema + real query planner
 * runs without leaking state between runs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDB } from '../local-db';
import { createRequire } from 'node:module';

// better-sqlite3 is a native addon. It's rebuilt for Electron's Node ABI in
// production (Phase 1.1 / 2.2 added the postinstall hook), which means the
// binary typically doesn't match vitest's Node 22. Skip these tests gracefully
// when the ABI mismatch hits — they run under CI matrices that rebuild for
// Node 22 explicitly before running vitest.
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Database: any = null;
try {
  Database = _require('better-sqlite3');
  // Touch the constructor to confirm the native binding actually loaded.
  new Database(':memory:').close();
} catch {
  Database = null;
}
const describeIfDb = Database ? describe : describe.skip;

// Minimal schema matching db/init.ts (only the tables LocalDB touches in
// these tests). If the production schema gains new columns we will either
// need to sync this or switch to invoking initSchema() from an exported helper.
const SCHEMA = `
  CREATE TABLE persona_configs (
    id TEXT PRIMARY KEY, name TEXT, system_prompt TEXT, chatflow_id TEXT,
    api_endpoint TEXT, status TEXT, error_message TEXT,
    confirmation_level TEXT, dangerous_tools_enabled INTEGER DEFAULT 0,
    activity_logging INTEGER DEFAULT 1, undo_enabled INTEGER DEFAULT 1,
    sandbox_enabled INTEGER DEFAULT 0, enabled_tools TEXT, allowed_paths TEXT,
    settings TEXT, synced_at TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY, persona_id TEXT, title TEXT,
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT,
    created_at TEXT
  );
  CREATE TABLE knowledge_documents (
    id TEXT PRIMARY KEY, persona_id TEXT, title TEXT, file_name TEXT,
    file_type TEXT, file_size INTEGER, workspace_path TEXT, created_at TEXT
  );
  CREATE TABLE permission_memory (
    id TEXT PRIMARY KEY, persona_id TEXT, rule_key TEXT, decision TEXT,
    scope TEXT, created_at TEXT, expires_at TEXT
  );
  CREATE TABLE action_log_entries (
    id TEXT PRIMARY KEY, persona_id TEXT, tool TEXT, action TEXT,
    target TEXT, content_preview TEXT, result TEXT, deny_reason TEXT,
    backup_id TEXT, created_at TEXT
  );
  CREATE TABLE backup_records (
    id TEXT PRIMARY KEY, action_log_id TEXT, file_path TEXT,
    backup_path TEXT, created_at TEXT
  );
  CREATE TABLE app_preferences (
    id TEXT PRIMARY KEY, theme TEXT, language TEXT, api_provider TEXT,
    default_model TEXT, global_keyboard_shortcut TEXT, start_on_login INTEGER,
    created_at TEXT, updated_at TEXT
  );
`;

let db: LocalDB;

beforeEach(() => {
  if (!Database) return;
  // Bypass the file-backed constructor by patching in an in-memory instance.
  const raw = new Database(':memory:');
  raw.exec(SCHEMA);
  db = Object.create(LocalDB.prototype) as LocalDB;
  (db as unknown as { db: import('better-sqlite3').Database }).db = raw;
});

describeIfDb('LocalDB.deletePersona — cascade (QA INT4)', () => {
  it('wipes persona row + owned messages + sessions + kb + permissions', () => {
    const now = new Date().toISOString();
    const pid = 'p1';

    db.db.prepare(`INSERT INTO persona_configs (id, name, status, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?)`).run(pid, 'Test', now, now);
    db.db.prepare(`INSERT INTO chat_sessions (id, persona_id, created_at, updated_at)
      VALUES ('s1', ?, ?, ?)`).run(pid, now, now);
    db.db.prepare(`INSERT INTO chat_messages (id, session_id, role, content, created_at)
      VALUES ('m1', 's1', 'user', 'hi', ?)`).run(now);
    db.db.prepare(`INSERT INTO knowledge_documents (id, persona_id, title, file_name, file_type, file_size, workspace_path, created_at)
      VALUES ('k1', ?, 't', 'f', 'md', 10, '/tmp/x', ?)`).run(pid, now);
    db.db.prepare(`INSERT INTO permission_memory (id, persona_id, rule_key, decision, scope, created_at)
      VALUES ('pm1', ?, 'r', 'allow', 'session', ?)`).run(pid, now);
    db.db.prepare(`INSERT INTO action_log_entries (id, persona_id, tool, action, target, created_at)
      VALUES ('a1', ?, 'read', 'allow', '/tmp', ?)`).run(pid, now);
    db.db.prepare(`INSERT INTO backup_records (id, action_log_id, file_path, backup_path, created_at)
      VALUES ('b1', 'a1', '/tmp/x', '/tmp/y', ?)`).run(now);

    db.deletePersona(pid);

    const countOf = (sql: string) => (db.db.prepare(sql).get() as { c: number }).c;
    expect(countOf('SELECT COUNT(*) c FROM persona_configs')).toBe(0);
    expect(countOf('SELECT COUNT(*) c FROM chat_sessions')).toBe(0);
    expect(countOf('SELECT COUNT(*) c FROM chat_messages')).toBe(0);
    expect(countOf('SELECT COUNT(*) c FROM knowledge_documents')).toBe(0);
    expect(countOf('SELECT COUNT(*) c FROM permission_memory')).toBe(0);
    expect(countOf('SELECT COUNT(*) c FROM action_log_entries')).toBe(0);
    expect(countOf('SELECT COUNT(*) c FROM backup_records')).toBe(0);
  });

  it('leaves unrelated personas alone', () => {
    const now = new Date().toISOString();
    db.db.prepare(`INSERT INTO persona_configs (id, name, status, created_at, updated_at)
      VALUES ('p1', 'A', 'active', ?, ?), ('p2', 'B', 'active', ?, ?)`).run(now, now, now, now);

    db.deletePersona('p1');

    const rows = db.db.prepare('SELECT id FROM persona_configs').all() as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(['p2']);
  });
});

describeIfDb('LocalDB knowledge-doc lookup (Phase 3.3)', () => {
  it('getKnowledgeDocById returns the row before delete', () => {
    const now = new Date().toISOString();
    db.db.prepare(`INSERT INTO persona_configs (id, name, status, created_at, updated_at)
      VALUES ('p1', 'T', 'active', ?, ?)`).run(now, now);
    db.db.prepare(`INSERT INTO knowledge_documents (id, persona_id, title, file_name, file_type, file_size, workspace_path, created_at)
      VALUES ('k1', 'p1', 'My Doc', 'my.md', 'md', 42, '/tmp/my.md', ?)`).run(now);

    const doc = db.getKnowledgeDocById('k1');
    expect(doc?.id).toBe('k1');
    expect(doc?.workspacePath).toBe('/tmp/my.md');
  });

  it('getKnowledgeDocById returns undefined for missing id', () => {
    expect(db.getKnowledgeDocById('nope')).toBeUndefined();
  });
});
