import { describe, it, expect, vi } from 'vitest';

// Mock child_process and fs before importing the module
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => '/usr/local/bin'),
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    createWriteStream: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
}));

vi.mock('node:https', () => ({ default: { get: vi.fn() } }));
vi.mock('node:http', () => ({ default: { get: vi.fn(), request: vi.fn() } }));

import {
  getPlatformKey,
  getNodeDownloadUrl,
  getNodePath,
  getNpmPath,
  getOpenClawBinPath,
} from '../openclaw-manager';

describe('getPlatformKey', () => {
  it('returns a valid platform string', () => {
    const validKeys = ['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'];
    // On the current machine, one of these must be valid
    const key = getPlatformKey();
    expect(validKeys).toContain(key);
  });
});

describe('getNodeDownloadUrl', () => {
  it('returns a .tar.gz URL on macOS/Linux', () => {
    const url = getNodeDownloadUrl();
    if (process.platform === 'win32') {
      expect(url).toMatch(/\.zip$/);
    } else {
      expect(url).toMatch(/\.tar\.gz$/);
    }
  });

  it('includes the Node.js version', () => {
    const url = getNodeDownloadUrl();
    expect(url).toContain('nodejs.org/dist/v');
  });
});

describe('getNodePath', () => {
  it('returns path ending with node or node.exe', () => {
    const nodePath = getNodePath();
    if (process.platform === 'win32') {
      expect(nodePath).toMatch(/node\.exe$/);
    } else {
      expect(nodePath).toMatch(/\/bin\/node$/);
    }
  });
});

describe('getNpmPath', () => {
  it('returns path ending with npm or npm.cmd', () => {
    const npmPath = getNpmPath();
    if (process.platform === 'win32') {
      expect(npmPath).toMatch(/npm\.cmd$/);
    } else {
      expect(npmPath).toMatch(/\/bin\/npm$/);
    }
  });
});

describe('getOpenClawBinPath', () => {
  it('returns path ending with openclaw or openclaw.cmd', () => {
    const binPath = getOpenClawBinPath();
    if (process.platform === 'win32') {
      expect(binPath).toMatch(/openclaw\.cmd$/);
    } else {
      expect(binPath).toMatch(/openclaw$/);
    }
  });
});
