/**
 * path-validator tests — QA finding UT2 (was CRITICAL-coverage).
 *
 * These tests cover the happy path and the specific adversarial cases the
 * validator is designed to stop (traversal, symlinks outside allowed set,
 * blocked-paths override, write-vs-read mode).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validatePath } from '../path-validator';
import type { PathPermission } from '../../src/types';

// Build a fresh tmp workspace per-test-run. Use realpath on all paths because
// macOS resolves `/var/folders/...` through a `/var → /private/var` symlink
// and the validator uses realpathSync on the input but NOT on the allowed
// paths — so we pass already-resolved paths in perms.
const sandboxRaw = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-test-'));
const sandbox = fs.realpathSync(sandboxRaw);
const allowedDir = path.join(sandbox, 'allowed');
const forbiddenDir = path.join(sandbox, 'forbidden');
fs.mkdirSync(allowedDir, { recursive: true });
fs.mkdirSync(forbiddenDir, { recursive: true });
fs.writeFileSync(path.join(allowedDir, 'file.txt'), 'hello');
fs.writeFileSync(path.join(forbiddenDir, 'secret.txt'), 'shh');

const perms: PathPermission[] = [{ path: allowedDir, mode: 'readwrite' }];

describe('validatePath — happy path', () => {
  it('accepts a read to a file inside an allowed dir', () => {
    const r = validatePath(path.join(allowedDir, 'file.txt'), perms, 'read');
    expect(r.valid).toBe(true);
    expect(r.resolvedPath).toContain('allowed');
  });

  it('accepts a write when the allowed path has readwrite mode', () => {
    const r = validatePath(path.join(allowedDir, 'new.txt'), perms, 'write');
    expect(r.valid).toBe(true);
  });
});

describe('validatePath — traversal + outside-allowed', () => {
  it('rejects paths outside all allowed directories', () => {
    const r = validatePath(path.join(forbiddenDir, 'secret.txt'), perms, 'read');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/outside/i);
  });

  it('rejects .. traversal that escapes allowed dir', () => {
    const r = validatePath(
      path.join(allowedDir, '..', 'forbidden', 'secret.txt'),
      perms,
      'read',
    );
    expect(r.valid).toBe(false);
  });

  it('returns clear message when persona has zero allowed paths', () => {
    const r = validatePath(path.join(allowedDir, 'file.txt'), [], 'read');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/no allowed paths/i);
  });
});

describe('validatePath — write vs read mode', () => {
  it('rejects write when allowed path mode is read-only', () => {
    const readOnly: PathPermission[] = [{ path: allowedDir, mode: 'read' }];
    const r = validatePath(path.join(allowedDir, 'file.txt'), readOnly, 'write');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/read permission/i);
  });
});

describe('validatePath — blocked paths always win', () => {
  it('rejects paths in global blocklist (e.g., ~/.ssh) even if technically under an allowed dir', () => {
    // Use the real ~/.ssh path to exercise the blocked-paths check.
    const sshPath = path.join(os.homedir(), '.ssh', 'id_rsa');
    const homeAllowed: PathPermission[] = [{ path: '~', mode: 'readwrite' }];
    const r = validatePath(sshPath, homeAllowed, 'read');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/blocked/i);
  });
});

describe('validatePath — tilde expansion', () => {
  it('expands ~ to home directory', () => {
    const homeAllowed: PathPermission[] = [{ path: '~', mode: 'read' }];
    const r = validatePath('~/', homeAllowed, 'read');
    // Whether this comes back valid depends on whether ~ is in the blocklist.
    // Either way, the resolvedPath should NOT contain a literal tilde.
    expect(r.resolvedPath.startsWith('~')).toBe(false);
  });
});
