/**
 * voice-key-store tests — QA finding UT2.
 *
 * Verifies encrypt→store→read→decrypt round-trip with mocked Electron
 * `safeStorage`, and guards against the known failure modes (invalid
 * provider, missing secure storage, missing file).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Build a scratch directory so the encrypted files live somewhere real.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vks-test-'));

// Mock Electron's app.getPath and safeStorage. safeStorage just returns the
// Buffer form of the input so tests can verify round-trip integrity.
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => scratch) },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`, 'utf-8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf-8').replace(/^enc:/, '')),
  },
}));

import { storeVoiceKey, getVoiceKey, deleteVoiceKey, hasVoiceKey } from '../voice-key-store';
import { safeStorage } from 'electron';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
});

describe('storeVoiceKey', () => {
  it('round-trips a key through safeStorage', async () => {
    await storeVoiceKey('cloud-openai', 'sk-test-123');
    const out = await getVoiceKey('cloud-openai');
    expect(out).toBe('sk-test-123');
  });

  it('rejects unknown providers', async () => {
    await expect(storeVoiceKey('bogus', 'x')).rejects.toThrow(/Invalid provider/);
  });

  it('rejects empty keys', async () => {
    await expect(storeVoiceKey('cloud-openai', '   ')).rejects.toThrow(/empty/);
  });

  it('accepts openrouter as a valid provider (Phase 1.4 migration)', async () => {
    await storeVoiceKey('openrouter', 'sk-or-test');
    expect(await getVoiceKey('openrouter')).toBe('sk-or-test');
  });

  it('fails loudly if safeStorage is unavailable', async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
    await expect(storeVoiceKey('cloud-openai', 'x')).rejects.toThrow(/unavailable/);
  });
});

describe('getVoiceKey', () => {
  it('returns null when no key file exists', async () => {
    await deleteVoiceKey('cloud-google'); // ensure absent
    expect(await getVoiceKey('cloud-google')).toBeNull();
  });
});

describe('hasVoiceKey', () => {
  it('is a boolean-only existence check (does not decrypt)', async () => {
    await storeVoiceKey('cloud-elevenlabs', 'secret');
    expect(await hasVoiceKey('cloud-elevenlabs')).toBe(true);
    // Clearing mock counts isolates this assertion from the store() call above.
    vi.mocked(safeStorage.decryptString).mockClear();
    await hasVoiceKey('cloud-elevenlabs');
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
  });

  it('returns false for unknown providers (no throw)', async () => {
    expect(await hasVoiceKey('totally-fake')).toBe(false);
  });
});

describe('deleteVoiceKey', () => {
  it('removes the file and subsequent get returns null', async () => {
    await storeVoiceKey('cloud-openai', 'to-be-deleted');
    await deleteVoiceKey('cloud-openai');
    expect(await getVoiceKey('cloud-openai')).toBeNull();
  });
});
