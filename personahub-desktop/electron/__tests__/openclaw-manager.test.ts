import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Electron's app module
vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/fake/app'),
    isPackaged: false,
  },
}));

vi.mock('node:child_process', () => ({
  // Vitest 4 strict ESM — the factory must expose a `default` export for
  // `import cp from 'node:child_process'` AND named exports for
  // `import { spawn } from 'node:child_process'`. Mirrors the pattern above
  // for 'node:fs'.
  default: { spawn: vi.fn() },
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('node:http', () => ({ default: { get: vi.fn() } }));

import { getOpenClawEntryPath, checkInstallation, writeConfig } from '../openclaw-manager';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// Platform-agnostic substring: builds the expected fragment using the
// host's path separator so the same assertion passes on macOS/Linux
// (forward slashes) and Windows (backslashes).
const NODE_MODULES_OPENCLAW_ENTRY = path.join('node_modules', 'openclaw', 'openclaw.mjs');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOpenClawEntryPath', () => {
  it('returns path inside node_modules in dev mode', () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true });
    vi.mocked(app.getAppPath).mockReturnValue('/project/personahub-desktop');

    const result = getOpenClawEntryPath();
    expect(result).toContain(NODE_MODULES_OPENCLAW_ENTRY);
    expect(result).not.toContain('app.asar.unpacked');
  });

  it('returns asar.unpacked path in production', () => {
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true });
    vi.mocked(app.getAppPath).mockReturnValue('/app/resources/app.asar');

    const result = getOpenClawEntryPath();
    expect(result).toContain('app.asar.unpacked');
    expect(result).toContain(NODE_MODULES_OPENCLAW_ENTRY);
  });
});

describe('checkInstallation', () => {
  it('returns false when config file is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = await checkInstallation();
    expect(result).toBe(false);
  });

  it('returns true when both config and entry script exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // checkInstallation also verifies a configured provider via getConfiguredProvider,
    // which reads openclaw.json. Provide a config with a non-empty anthropic key.
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ models: { providers: { anthropic: { apiKey: 'test-key' } } } })
    );
    const result = await checkInstallation();
    expect(result).toBe(true);
  });

  it('returns false when only one file exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true).mockReturnValueOnce(false);
    const result = await checkInstallation();
    expect(result).toBe(false);
  });
});

describe('writeConfig', () => {
  it('creates the config directory', () => {
    writeConfig('test-key', 'google');
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.openclaw'),
      { recursive: true }
    );
  });

  it('writes valid JSON with google provider', () => {
    writeConfig('test-key', 'google');
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    const config = JSON.parse(writeCall[1] as string);

    expect(config.models.providers.google.apiKey).toBe('test-key');
    expect(config.agents.defaults.model.primary).toBe('google/gemini-2.5-flash');
    expect(config.gateway.port).toBe(18789);
  });

  it('writes valid JSON with anthropic provider', () => {
    writeConfig('sk-ant-test', 'anthropic');
    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]!;
    const config = JSON.parse(writeCall[1] as string);

    expect(config.models.providers.anthropic.apiKey).toBe('sk-ant-test');
    expect(config.agents.defaults.model.primary).toBe('anthropic/claude-sonnet-4-5');
  });
});
