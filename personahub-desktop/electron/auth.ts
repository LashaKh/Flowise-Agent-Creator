/**
 * Auth Module — Handles the OAuth dance between the desktop app, browser, and Supabase.
 *
 * Flow: App opens browser → User signs in with Google → Browser redirects to
 * personahub://auth/callback?code=xxx → App exchanges code for session tokens.
 *
 * PKCE (Proof Key for Code Exchange) prevents anyone from stealing the auth code
 * mid-flight — like a tamper-evident seal on a package.
 */
import { shell } from 'electron';
import crypto from 'node:crypto';
import { getToken, storeToken, clearToken } from './secure-store';
import type { AuthState } from '../src/types';

const SUPABASE_URL = 'https://wlvfilxtvqjzwqjhfcdk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsdmZpbHh0dnFqendxamhmY2RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5ODM5MzYsImV4cCI6MjA3OTU1OTkzNn0.DSx2Bs36hocuCrrtecn1sAg-cTgDH5RHXOsHI72md3E';
const PROTOCOL = 'personahub';

// PKCE state stored between start and callback
let pkceVerifier: string | null = null;

// ─── PKCE Helpers ──────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ─── Start OAuth Flow ──────────────────────────

export async function startOAuthFlow(): Promise<void> {
  pkceVerifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(pkceVerifier);

  const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authUrl.searchParams.set('provider', 'google');
  authUrl.searchParams.set('redirect_to', `${PROTOCOL}://auth/callback`);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Open user's default browser for Google sign-in
  await shell.openExternal(authUrl.toString());
}

// ─── Handle OAuth Callback ─────────────────────

export async function handleAuthCallback(url: string): Promise<AuthState> {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');

    if (!code || !pkceVerifier) {
      return { isAuthenticated: false, error: 'Missing auth code or PKCE verifier' };
    }

    // Exchange code for session tokens
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        auth_code: code,
        code_verifier: pkceVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { isAuthenticated: false, error: `Auth failed: ${error}` };
    }

    const data = await response.json();

    // Store tokens securely (OS keychain)
    await storeToken(JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }));

    pkceVerifier = null;

    return {
      isAuthenticated: true,
      userId: data.user?.id,
      email: data.user?.email,
      accessToken: data.access_token,
    };
  } catch (error) {
    return {
      isAuthenticated: false,
      error: error instanceof Error ? error.message : 'Unknown auth error',
    };
  }
}

// ─── Email/Password Sign In ─────────────────────

export async function signInWithPassword(email: string, password: string): Promise<AuthState> {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const err = await response.json();
      return { isAuthenticated: false, error: err.error_description || err.msg || 'Sign in failed' };
    }

    const data = await response.json();

    await storeToken(JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }));

    return {
      isAuthenticated: true,
      userId: data.user?.id,
      email: data.user?.email,
      accessToken: data.access_token,
    };
  } catch (error) {
    return {
      isAuthenticated: false,
      error: error instanceof Error ? error.message : 'Sign in failed',
    };
  }
}

// ─── Check Auth State ──────────────────────────

export async function getAuthState(): Promise<AuthState> {
  try {
    const stored = await getToken();
    if (!stored) {
      return { isAuthenticated: false };
    }

    const tokens = JSON.parse(stored);

    // Check if token is expired (with 5-minute buffer)
    if (tokens.expiresAt < Date.now() + 5 * 60 * 1000) {
      return refreshToken();
    }

    // Decode JWT to get user info (no verification needed — Supabase already verified)
    const payload = JSON.parse(
      Buffer.from(tokens.accessToken.split('.')[1], 'base64').toString()
    );

    return {
      isAuthenticated: true,
      userId: payload.sub,
      email: payload.email,
      accessToken: tokens.accessToken,
    };
  } catch {
    return { isAuthenticated: false };
  }
}

// ─── Refresh Token ─────────────────────────────

export async function refreshToken(): Promise<AuthState> {
  try {
    const stored = await getToken();
    if (!stored) {
      return { isAuthenticated: false, error: 'No stored tokens' };
    }

    const tokens = JSON.parse(stored);

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        refresh_token: tokens.refreshToken,
      }),
    });

    if (!response.ok) {
      await clearToken();
      return { isAuthenticated: false, error: 'Token refresh failed' };
    }

    const data = await response.json();

    await storeToken(JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }));

    return {
      isAuthenticated: true,
      userId: data.user?.id,
      email: data.user?.email,
      accessToken: data.access_token,
    };
  } catch (error) {
    return {
      isAuthenticated: false,
      error: error instanceof Error ? error.message : 'Refresh failed',
    };
  }
}

// ─── Logout ────────────────────────────────────

export async function logout(): Promise<void> {
  await clearToken();
}

