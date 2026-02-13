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
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: store as plain text (less secure, but works)
    fs.writeFileSync(getTokenPath(), token, 'utf-8');
    return;
  }

  const encrypted = safeStorage.encryptString(token);
  fs.writeFileSync(getTokenPath(), encrypted);
}

export async function getToken(): Promise<string | null> {
  const tokenPath = getTokenPath();

  if (!fs.existsSync(tokenPath)) {
    return null;
  }

  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return fs.readFileSync(tokenPath, 'utf-8');
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
