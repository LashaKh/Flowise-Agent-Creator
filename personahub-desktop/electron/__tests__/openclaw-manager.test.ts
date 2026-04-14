import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Electron's app module
vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/fake/app'),
    isPackaged: false,
  },
}));

vi.mock('node:child_process', () => ({
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOpenClawEntryPath', () => {
  it('returns path inside node_modules in dev mode', () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true });
    vi.mocked(app.getAppPath).mockReturnValue('/project/personahub-desktop');

    const result = getOpenClawEntryPath();
    expect(result).toContain('node_modules/openclaw/openclaw.mjs');
    expect(result).not.toContain('app.asar.unpacked');
  });

  it('returns asar.unpacked path in production', () => {
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true });
    vi.mocked(app.getAppPath).mockReturnValue('/app/resources/app.asar');

    const result = getOpenClawEntryPath();
    expect(result).toContain('app.asar.unpacked');
    expect(result).toContain('node_modules/openclaw/openclaw.mjs');
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
