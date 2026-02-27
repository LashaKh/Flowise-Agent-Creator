/**
 * Blocked Paths — Checks if a file path matches any blocked pattern.
 *
 * Think of this as a bouncer at a nightclub with a "do not enter" list.
 * Some paths (like ~/.ssh) are NEVER accessible, no matter what.
 * Patterns like ** /secrets* catch sensitive files anywhere on disk.
 */
import * as os from 'os';
import * as path from 'path';
import { BLOCKED_PATH_PATTERNS } from '../src/constants/security';

export interface BlockedPathResult {
  blocked: boolean;
  pattern?: string;
}

/**
 * Expand ~ to the user's home directory and normalize the path.
 */
export function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  if (p.startsWith('%USERPROFILE%')) {
    return path.join(os.homedir(), p.slice('%USERPROFILE%'.length));
  }
  if (p.startsWith('%APPDATA%')) {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, p.slice('%APPDATA%'.length));
  }
  if (p.startsWith('%LOCALAPPDATA%')) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, p.slice('%LOCALAPPDATA%'.length));
  }
  return p;
}

/**
 * Check if a filename matches a glob-style pattern using simple string matching.
 * Supports:
 *  - Exact prefix matching for ~/... patterns
 *  - ** /name patterns (matches "name" anywhere in the path)
 *  - ** /*.ext patterns (matches extension anywhere)
 *  - ** /prefix* patterns (matches prefix anywhere)
 */
function matchesPattern(resolvedPath: string, pattern: string): boolean {
  const normalizedPath = path.normalize(resolvedPath);

  // "**/" patterns — match anywhere in the path
  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3); // e.g. "node_modules", "*.pem", "secrets*"

    // Get every segment of the path and the filename
    const segments = normalizedPath.split(path.sep);

    for (const segment of segments) {
      if (matchSegment(segment, suffix)) {
        return true;
      }
    }
    return false;
  }

  // Tilde or %USERPROFILE% patterns — exact prefix match
  const expandedPattern = expandHome(pattern);
  const normalizedPattern = path.normalize(expandedPattern);

  // The path is blocked if it IS the blocked dir or is INSIDE it
  if (
    normalizedPath === normalizedPattern ||
    normalizedPath.startsWith(normalizedPattern + path.sep)
  ) {
    return true;
  }

  return false;
}

/**
 * Match a single path segment against a simple glob pattern.
 * e.g. "*.pem" matches "server.pem", "secrets*" matches "secrets.json"
 */
function matchSegment(segment: string, pattern: string): string | false {
  const lower = segment.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  // Exact match: "node_modules" === "node_modules"
  if (lower === lowerPattern) return segment;

  // Wildcard at start: "*.pem" — check if segment ends with ".pem"
  if (lowerPattern.startsWith('*') && !lowerPattern.endsWith('*')) {
    const suffix = lowerPattern.slice(1);
    if (lower.endsWith(suffix)) return segment;
  }

  // Wildcard at end: "secrets*" — check if segment starts with "secrets"
  if (lowerPattern.endsWith('*') && !lowerPattern.startsWith('*')) {
    const prefix = lowerPattern.slice(0, -1);
    if (lower.startsWith(prefix)) return segment;
  }

  // Wildcards on both sides: "*secret*" (not currently used, but safe)
  if (lowerPattern.startsWith('*') && lowerPattern.endsWith('*')) {
    const middle = lowerPattern.slice(1, -1);
    if (lower.includes(middle)) return segment;
  }

  return false;
}

/**
 * Check if a given absolute path is blocked.
 * Returns which pattern matched so we can tell the user WHY.
 */
export function isPathBlocked(absolutePath: string): BlockedPathResult {
  const normalized = path.normalize(absolutePath);

  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (matchesPattern(normalized, pattern)) {
      return { blocked: true, pattern };
    }
  }

  return { blocked: false };
}
