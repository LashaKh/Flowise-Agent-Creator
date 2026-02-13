/**
 * BackupManager — File backup and undo system.
 *
 * Before any file write/edit/delete, we take a snapshot (like a save point
 * in a video game). If the user doesn't like what the persona did, they can
 * hit "undo" and we restore the original file. Old backups get cleaned up
 * automatically so they don't eat all the disk space.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BackupRecord, UndoResult } from '../src/types';
import { getDatabase } from '../db/init';

const BACKUP_DIR = path.join(os.homedir(), '.personahub', 'history');

/**
 * Ensure the backup directory exists.
 */
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Create a backup of a file before modifying or deleting it.
 *
 * - If the file exists, we copy it to the backup directory
 * - If it doesn't exist (new file being created), we just note that
 *   so undo can delete the newly created file
 */
export function backupBeforeAction(
  originalPath: string,
  actionType: 'write' | 'edit' | 'delete',
  actionLogId: string = ''
): BackupRecord {
  ensureBackupDir();

  const fileExisted = fs.existsSync(originalPath);
  const timestamp = Date.now();
  const filename = path.basename(originalPath);
  const backupFilename = `${timestamp}-${filename}`;
  const backupPath = path.join(BACKUP_DIR, backupFilename);

  // If the file exists, copy it to the backup location
  if (fileExisted) {
    fs.copyFileSync(originalPath, backupPath);
  }

  return getDatabase().insertBackup({
    actionLogId,
    originalPath,
    backupPath: fileExisted ? backupPath : '',
    actionType,
    fileExisted,
  });
}

/**
 * Undo a previous action by restoring (or deleting) the file.
 *
 * - If the original file existed: restore from backup
 * - If it didn't exist (was newly created): delete the new file
 */
export function undo(backupId: string): UndoResult {
  const record = getDatabase().getBackupById(backupId);

  if (!record) {
    return { success: false, restoredPath: '', error: 'Backup record not found' };
  }

  if (record.undone) {
    return { success: false, restoredPath: record.originalPath, error: 'Already undone' };
  }

  try {
    if (record.fileExisted) {
      // Restore the original file from backup
      if (!fs.existsSync(record.backupPath)) {
        return {
          success: false,
          restoredPath: record.originalPath,
          error: 'Backup file is missing',
        };
      }
      // Ensure the target directory exists
      const dir = path.dirname(record.originalPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.copyFileSync(record.backupPath, record.originalPath);
    } else {
      // File was newly created — delete it to undo
      if (fs.existsSync(record.originalPath)) {
        fs.unlinkSync(record.originalPath);
      }
    }

    getDatabase().markBackupUndone(record.id);

    return { success: true, restoredPath: record.originalPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, restoredPath: record.originalPath, error: message };
  }
}

/**
 * Clean up old backups when total count exceeds maxBackups.
 *
 * - If total count exceeds maxBackups, delete oldest backup files from disk and DB
 * - Returns how many were deleted and whether the user should be warned
 */
export function cleanup(
  _retentionDays: number = 30,
  maxBackups: number = 500
): { deleted: number; warned: boolean } {
  const db = getDatabase();
  const totalCount = db.getBackupCount();
  let deleted = 0;

  if (totalCount > maxBackups) {
    const excessCount = totalCount - maxBackups;
    const oldest = db.getOldestBackups(excessCount);

    // Delete backup files from disk
    for (const record of oldest) {
      deleteBackupFile(record);
    }

    // Delete from database
    db.deleteOldestBackups(excessCount);
    deleted = oldest.length;
  }

  // Warn when approaching the limit (>80% full)
  const currentCount = db.getBackupCount();
  const warned = currentCount > maxBackups * 0.8;

  return { deleted, warned };
}

/**
 * Get all backup records.
 */
export function getRecords(_personaId?: string): BackupRecord[] {
  // TODO: BackupRecord doesn't have personaId — would need a join through action_log_entries
  return [];
}

// ─── Helpers ───────────────────────────────────

function deleteBackupFile(record: BackupRecord): void {
  if (record.backupPath && fs.existsSync(record.backupPath)) {
    try {
      fs.unlinkSync(record.backupPath);
    } catch {
      // Best-effort cleanup — don't crash if file is locked
    }
  }
}
