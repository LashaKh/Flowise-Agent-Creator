/**
 * Secure Store — Stores auth tokens using the OS keychain.
 *
 * On macOS: uses Keychain
 * On Windows: uses Credential Manager (DPAPI)
 * On Linux: uses libsecret
 *
 * Think of it like a safe deposit box at the bank — even if someone
 * reads your app's files, they can't get the tokens without OS-level access.
 */
import { safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const TOKEN_FILE = 'auth-token.enc';

function getTokenPath(): string {
  return path.join(app.getPath('userData'), TOKEN_FILE);
}

export async function storeToken(token: string): Promise<void> {
  const tokenPath = getTokenPath();
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });

  // Fail closed: previously we silently fell back to plaintext on systems
  // without OS encryption. That wrote the user's Supabase session token to
  // disk where any local process could read it (audit finding P3-A-5).
  // The voice-key-store uses the same fail-closed pattern.
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Secure storage is unavailable on this system. ' +
      'PersonaHub refuses to store authentication tokens without OS-level encryption.'
    );
  }

  const encrypted = safeStorage.encryptString(token);
  fs.writeFileSync(tokenPath, encrypted);
  // Restrict permissions to owner-only (audit P5-B-4)
  try { fs.chmodSync(tokenPath, 0o600); } catch { /* best-effort */ }
}

export async function getToken(): Promise<string | null> {
  const tokenPath = getTokenPath();

  if (!fs.existsSync(tokenPath)) {
    return null;
  }

  try {
    if (!safeStorage.isEncryptionAvailable()) {
      // If encryption was available when we stored but isn't now, refuse
      // to return anything. This avoids reading stale plaintext files that
      // may exist from earlier app versions.
      return null;
    }

    const encrypted = fs.readFileSync(tokenPath);
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  const tokenPath = getTokenPath();
  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath);
  }
}

export function hasToken(): boolean {
  return fs.existsSync(getTokenPath());
}
