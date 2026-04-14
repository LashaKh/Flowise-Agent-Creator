/**
 * Voice Key Store — Per-provider encrypted API key storage.
 * Uses OS secure store (Keychain/CredentialManager/libsecret).
 * Each provider gets its own file: voice-key-{providerId}.enc
 */
import { safeStorage, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const VALID_PROVIDERS = ['cloud-openai', 'cloud-elevenlabs', 'cloud-google'] as const;

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
