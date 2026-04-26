/**
 * Voice Key Store — Per-provider encrypted API key storage.
 * Uses OS secure store (Keychain/CredentialManager/libsecret).
 * Each provider gets its own file: voice-key-{providerId}.enc
 *
 * CONSTRAINT (QA finding INT3): keys are scoped per-provider, NOT per-persona.
 * If persona A uses ElevenLabs key K1 and persona B later stores key K2 under
 * the same 'cloud-elevenlabs' provider slot, K1 is silently overwritten. This
 * is usually what the user wants (one key per provider across all personas),
 * but it's worth surfacing in the UI when offering a "different key for this
 * persona" feature. Per-persona keys would require keying files by
 * `voice-key-{personaId}-{providerId}.enc` — defer until a real use case
 * emerges.
 */
import { safeStorage, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const VALID_PROVIDERS = ['cloud-openai', 'cloud-elevenlabs', 'cloud-google', 'openrouter'] as const;

function getKeyPath(providerId: string): string {
  return path.join(app.getPath('userData'), `voice-key-${providerId}.enc`);
}

function isValidProvider(id: string): boolean {
  return (VALID_PROVIDERS as readonly string[]).includes(id);
}

export async function storeVoiceKey(providerId: string, apiKey: string): Promise<boolean> {
  if (!isValidProvider(providerId)) throw new Error('Invalid provider ID');
  if (!apiKey || !apiKey.trim()) throw new Error('API key cannot be empty');

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is unavailable on this system');
  }

  const keyPath = getKeyPath(providerId);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const encrypted = safeStorage.encryptString(apiKey.trim());
  fs.writeFileSync(keyPath, encrypted);
  // Restrict permissions to owner-only (audit finding P5-B-4). Defense in
  // depth — the file is already encrypted by safeStorage, but there's no
  // reason other users on the same machine should be able to read it.
  try { fs.chmodSync(keyPath, 0o600); } catch { /* best-effort on Windows */ }
  return true;
}

export async function getVoiceKey(providerId: string): Promise<string | null> {
  if (!isValidProvider(providerId)) throw new Error('Invalid provider ID');

  const keyPath = getKeyPath(providerId);
  if (!fs.existsSync(keyPath)) return null;

  try {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is unavailable');
    }
    const encrypted = fs.readFileSync(keyPath);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

export async function deleteVoiceKey(providerId: string): Promise<boolean> {
  if (!isValidProvider(providerId)) throw new Error('Invalid provider ID');

  const keyPath = getKeyPath(providerId);
  if (fs.existsSync(keyPath)) {
    fs.unlinkSync(keyPath);
  }
  return true;
}

/**
 * Cheap existence check — does NOT decrypt the key. Use this when the caller
 * only needs to know whether a key has been configured (e.g., gating UI).
 */
export async function hasVoiceKey(providerId: string): Promise<boolean> {
  if (!isValidProvider(providerId)) return false;
  return fs.existsSync(getKeyPath(providerId));
}
