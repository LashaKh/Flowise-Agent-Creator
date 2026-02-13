/**
 * Database initialization for PersonaHub Desktop.
 *
 * This file does three things:
 * 1. Opens (or creates) the SQLite database file in the app's user data folder
 * 2. Runs schema.sql to create all tables (safe to re-run — uses IF NOT EXISTS)
 * 3. Registers IPC handlers so the renderer process can query the database
 *    through the preload bridge (window.electronAPI.db.*)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import { LocalDB } from './local-db';

let localDB: LocalDB | null = null;

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

  // 2. Read and execute the schema file
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

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
