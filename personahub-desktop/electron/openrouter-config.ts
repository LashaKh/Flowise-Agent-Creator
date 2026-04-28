/**
 * OpenRouter Configuration
 *
 * Two-tier key strategy:
 *   1. User-provided key in safeStorage (Settings → AI & Models). When set,
 *      this takes precedence — the user's traffic is billed to their own
 *      OpenRouter account, with their own rate limits and model access.
 *   2. Bundled fallback key (BUNDLED_OPENROUTER_KEY below). This is the
 *      "Continue without setup" path — testers can use the app immediately
 *      without signing up for anything.
 *
 * SECURITY NOTE — the bundled key:
 *   - Is extractable from the .app/.exe via `strings`. Treat it as PUBLIC.
 *   - MUST have a hard monthly spend cap on https://openrouter.ai/credits.
 *   - MUST have a per-key rate limit set in OpenRouter's dashboard.
 *   - If abused, ROTATE: replace the constant below + ship a new release.
 *     Auto-updater pushes the new version; abusers are cut off on next run.
 *   - For users who hit the bundled key's rate limit, the in-app prompt
 *     directs them to set their own key in Settings → AI & Models.
 */
import { getVoiceKey, hasVoiceKey } from './voice-key-store';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_APP_NAME = 'PersonaHub Desktop';
export const OPENROUTER_APP_URL = 'https://personahub.app';

/**
 * Bundled fallback OpenRouter key — injected at BUILD TIME via Vite's
 * `define` config from the `PERSONAHUB_OPENROUTER_KEY` env var. The literal
 * key is never in this source file (so secret scanners on GitHub stay
 * quiet). It IS still in the built .dmg/.exe and extractable via `strings`
 * — that's an inherent property of any client-bundled key. To rotate:
 *   1. Revoke old key + create new on https://openrouter.ai/settings/keys
 *   2. Update GitHub Actions secret PERSONAHUB_OPENROUTER_KEY
 *   3. Bump version + tag — CI bakes the new key into the next release.
 *   4. Auto-updater pushes the new build; old keys stop working on revoke.
 *
 * Local dev: set PERSONAHUB_OPENROUTER_KEY in `.env.local` (gitignored)
 * or in your shell. If unset, the bundled fallback is empty and users
 * must provide their own OpenRouter key in Settings.
 */
const BUNDLED_OPENROUTER_KEY: string = process.env.PERSONAHUB_OPENROUTER_KEY ?? '';

/**
 * Load an OpenRouter API key. Prefers the user's own key from safeStorage;
 * falls back to the bundled key so the app works out-of-the-box.
 */
export async function getOpenRouterApiKey(): Promise<string | null> {
  const userKey = await getVoiceKey('openrouter');
  if (userKey) return userKey;
  return BUNDLED_OPENROUTER_KEY || null;
}

/**
 * Check whether an OpenRouter key is configured. Returns true if EITHER a
 * user key is set OR a bundled key is present (which it always is in
 * production builds).
 */
export async function hasOpenRouterApiKey(): Promise<boolean> {
  if (await hasVoiceKey('openrouter')) return true;
  return Boolean(BUNDLED_OPENROUTER_KEY);
}

/**
 * Returns true ONLY when the user has set their own OpenRouter key — useful
 * for UI badges like "Built-in tier — switch to your own key in Settings".
 */
export async function hasUserOpenRouterApiKey(): Promise<boolean> {
  return hasVoiceKey('openrouter');
}

/**
 * Authoritative list of model IDs that get routed through OpenRouter.
 * The agent-bridge checks this set to decide which backend to use.
 * Keep in sync with MODEL_CATALOG in src/constants/models.ts.
 */
export const OPENROUTER_MODEL_IDS = new Set<string>([
  'deepseek/deepseek-v3.2',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-scout',
  'qwen/qwen3.5-122b-a10b',
  'moonshotai/kimi-k2.5',
]);
