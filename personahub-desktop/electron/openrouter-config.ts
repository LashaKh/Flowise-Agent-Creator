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
 * Bundled fallback OpenRouter key — used when the user hasn't set their own.
 * Treat as public; must have monthly cap + rate limit configured upstream.
 * To rotate: replace the value below, bump version, ship a new release.
 */
const BUNDLED_OPENROUTER_KEY =
  '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';

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
