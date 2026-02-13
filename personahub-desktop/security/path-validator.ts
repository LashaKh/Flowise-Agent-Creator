/**
 * Path Validator — Resolves and validates file paths before tool actions.
 *
 * This is like a security guard who checks IDs AND follows people to make sure
 * they're actually going where they say. Key security trick: we resolve the
 * REAL path first (following symlinks), THEN check if it's allowed. This stops
 * sneaky symlink attacks (like linking ~/allowed/shortcut -> ~/.ssh/id_rsa).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isPathBlocked } from './blocked-paths';
import type { PathPermission } from '../src/types';

export interface PathValidationResult {
  valid: boolean;
  reason?: string;
  resolvedPath: string;
}

/**
 * Resolve a path to its absolute, real (symlink-followed) form.
 * Handles ~, relative paths, and .. traversals.
 */
function resolvePath(inputPath: string): string {
  let resolved = inputPath;

  // Expand ~ to home directory
  if (resolved.startsWith('~/') || resolved === '~') {
    resolved = path.join(os.homedir(), resolved.slice(1));
  }

  // Make absolute if relative
  resolved = path.resolve(resolved);

  // Follow symlinks to get the REAL destination.
  // If the file doesn't exist yet (e.g., about to create it),
  // fall back to resolving the parent directory + filename.
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    // File doesn't exist yet — resolve the parent instead
    const dir = path.dirname(resolved);
    const base = path.basename(resolved);
    try {
      resolved = path.join(fs.realpathSync(dir), base);
    } catch {
      // Parent doesn't exist either — just use the resolved path as-is
    }
  }

  return resolved;
}

/**
 * Check if a resolved path falls within any of the persona's allowed paths.
 */
function isWithinAllowedPaths(
  resolvedPath: string,
  allowedPaths: PathPermission[],
  action: 'read' | 'write'
): { allowed: boolean; reason?: string } {
  if (allowedPaths.length === 0) {
    return { allowed: false, reason: 'Persona has no allowed paths configured' };
  }

  for (const { path: allowedPath, mode } of allowedPaths) {
    const expandedAllowed = allowedPath.startsWith('~/')
      ? path.join(os.homedir(), allowedPath.slice(1))
      : path.resolve(allowedPath);

    const normalizedAllowed = path.normalize(expandedAllowed);
    const normalizedResolved = path.normalize(resolvedPath);

    // Check if the resolved path is inside the allowed path
    const isInside =
      normalizedResolved === normalizedAllowed ||
      normalizedResolved.startsWith(normalizedAllowed + path.sep);

    if (isInside) {
      // For write actions, the allowed path must have readwrite mode
      if (action === 'write' && mode === 'read') {
        return {
          allowed: false,
          reason: `Path is in allowed folder "${allowedPath}" but only has read permission`,
        };
      }
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `Path is outside all allowed directories`,
  };
}

/**
 * Validate a path for a given persona and action.
 * Steps: resolve -> check blocked -> check allowed.
 */
export function validatePath(
  inputPath: string,
  allowedPaths: PathPermission[],
  action: 'read' | 'write' = 'read'
): PathValidationResult {
  // Step 1: Resolve to real absolute path (follows symlinks)
  const resolvedPath = resolvePath(inputPath);

  // Step 2: Check against globally blocked paths
  const blockCheck = isPathBlocked(resolvedPath);
  if (blockCheck.blocked) {
    return {
      valid: false,
      reason: `Path is blocked (matches pattern: ${blockCheck.pattern})`,
      resolvedPath,
    };
  }

  // Step 3: Check against persona's allowed paths
  const allowCheck = isWithinAllowedPaths(resolvedPath, allowedPaths, action);
  if (!allowCheck.allowed) {
    return {
      valid: false,
      reason: allowCheck.reason,
      resolvedPath,
    };
  }

  return { valid: true, resolvedPath };
}
