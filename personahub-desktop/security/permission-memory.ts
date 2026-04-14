/**
 * Permission Memory — Remembers "Allow Always" and "Block Always" decisions.
 *
 * When a user says "always allow this persona to read files in ~/Documents",
 * we store that decision here so they don't get asked again every time.
 * Entries can have an expiration time (e.g., "allow for 30 minutes").
 *
 * Backed by SQLite via the local database layer.
 */
import type { PermissionMemoryEntry } from '../src/types';
import { getDatabase } from '../db/init';

/**
 * Check if there's a stored permission for this persona + tool + path combo.
 * Returns 'allow', 'block', or null (no stored decision — ask the user).
 */
export function checkPermission(
  personaId: string,
  tool: string,
  targetPath?: string
): 'allow' | 'block' | null {
  clearExpired();

  const entry = getDatabase().findPermission(personaId, tool, targetPath ?? '');
  if (entry) {
    return entry.permission === 'allow_always' ? 'allow' : 'block';
  }
  return null;
}

/**
 * Save a new permission decision.
 */
export function savePermission(entry: Omit<PermissionMemoryEntry, 'id' | 'createdAt'> | PermissionMemoryEntry): void {
  getDatabase().insertPermission({
    personaId: entry.personaId,
    tool: entry.tool,
    pathPattern: entry.pathPattern,
    permission: entry.permission,
    expiresAt: entry.expiresAt,
  });
}

/**
 * Remove all expired permission entries.
 */
export function clearExpired(): void {
  getDatabase().deleteExpiredPermissions();
}

/**
 * Remove all permissions for a specific persona (e.g., when persona is deleted).
 */
export function clearForPersona(personaId: string): void {
  // TODO: Add deletePermissionsByPersona to LocalDB
  getDatabase().db.prepare('DELETE FROM permission_memory WHERE persona_id = ?').run(personaId);
}

/**
 * Get all current entries (for debugging or UI display).
 * Backed by a raw query since LocalDB doesn't have a typed method yet.
 */
interface PermissionRow {
  id: string;
  persona_id: string;
  tool: string;
  path_pattern: string;
  permission: 'allow_always' | 'block_always';
  expires_at: string | null;
  created_at: string;
}

export function getAllEntries(): PermissionMemoryEntry[] {
  const rows = getDatabase().db
    .prepare('SELECT * FROM permission_memory ORDER BY created_at DESC')
    .all() as PermissionRow[];
  return rows.map((row) => ({
    id: row.id,
    personaId: row.persona_id,
    tool: row.tool,
    pathPattern: row.path_pattern,
    permission: row.permission,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
  }));
}
