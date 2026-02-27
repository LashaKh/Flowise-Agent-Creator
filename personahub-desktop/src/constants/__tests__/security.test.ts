import { describe, it, expect } from 'vitest';
import {
  TOOL_CLASSIFICATIONS,
  BLOCKED_PATH_PATTERNS,
  getToolTier,
  isToolSafe,
  isToolBlocked,
} from '../security';

describe('getToolTier', () => {
  it('returns safe for read tool', () => {
    expect(getToolTier('read')).toBe('safe');
  });

  it('returns safe for ls tool', () => {
    expect(getToolTier('ls')).toBe('safe');
  });

  it('returns guarded for write tool', () => {
    expect(getToolTier('write')).toBe('guarded');
  });

  it('returns dangerous for delete tool', () => {
    expect(getToolTier('delete')).toBe('dangerous');
  });

  it('returns blocked for unknown tools', () => {
    expect(getToolTier('hack_mainframe')).toBe('blocked');
  });
});

describe('isToolSafe / isToolBlocked', () => {
  it('isToolSafe returns true for safe tools', () => {
    expect(isToolSafe('read')).toBe(true);
    expect(isToolSafe('web_search')).toBe(true);
  });

  it('isToolSafe returns false for non-safe tools', () => {
    expect(isToolSafe('write')).toBe(false);
    expect(isToolSafe('delete')).toBe(false);
  });

  it('isToolBlocked returns true for unknown tools', () => {
    expect(isToolBlocked('unknown_tool')).toBe(true);
  });

  it('isToolBlocked returns false for known tools', () => {
    expect(isToolBlocked('read')).toBe(false);
  });
});

describe('TOOL_CLASSIFICATIONS', () => {
  it('has at least one tool per tier', () => {
    const tiers = new Set(TOOL_CLASSIFICATIONS.map((t) => t.tier));
    expect(tiers.has('safe')).toBe(true);
    expect(tiers.has('guarded')).toBe(true);
    expect(tiers.has('dangerous')).toBe(true);
  });

  it('every classification has tool, tier, and description', () => {
    for (const c of TOOL_CLASSIFICATIONS) {
      expect(c.tool).toBeTruthy();
      expect(c.tier).toBeTruthy();
      expect(c.description).toBeTruthy();
    }
  });
});

describe('BLOCKED_PATH_PATTERNS', () => {
  it('has at least 10 patterns', () => {
    expect(BLOCKED_PATH_PATTERNS.length).toBeGreaterThanOrEqual(10);
  });

  it('all patterns are non-empty strings', () => {
    for (const p of BLOCKED_PATH_PATTERNS) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    }
  });

  it('includes macOS-specific paths', () => {
    expect(BLOCKED_PATH_PATTERNS).toContain('~/Library/Keychains');
  });

  it('includes Windows credential paths', () => {
    expect(BLOCKED_PATH_PATTERNS).toContain('%APPDATA%/Microsoft/Credentials');
    expect(BLOCKED_PATH_PATTERNS).toContain('%LOCALAPPDATA%/Microsoft/Vault');
  });

  it('includes cross-platform glob patterns', () => {
    expect(BLOCKED_PATH_PATTERNS).toContain('**/*.pem');
    expect(BLOCKED_PATH_PATTERNS).toContain('**/*.key');
    expect(BLOCKED_PATH_PATTERNS).toContain('**/secrets*');
  });
});
