/**
 * OpenRouter Configuration
 *
 * The API key is NOT bundled in the binary anymore — that was an extraction
 * risk (any user could `strings` the .app and recover a shared key).
 *
 * Instead, users provide their own OpenRouter key in Settings → AI & Models.
 * The key is persisted via `voice-key-store.ts` (OS `safeStorage`), under the
 * `'openrouter'` provider slot. Reads are async and may return null when no
 * key has been configured yet — the caller should surface a friendly prompt
 * to open Settings in that case.
 */
import { getVoiceKey, hasVoiceKey } from './voice-key-store';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_APP_NAME = 'PersonaHub Desktop';
export const OPENROUTER_APP_URL = 'https://personahub.app';

/**
 * Load the user's OpenRouter API key from safeStorage.
 * Returns null if the user hasn't set one yet.
 */
export async function getOpenRouterApiKey(): Promise<string | null> {
  return getVoiceKey('openrouter');
}

/**
 * Check whether an OpenRouter key is configured. Cheaper than getOpenRouterApiKey
 * because it only checks for file existence — no decryption.
 */
export async function hasOpenRouterApiKey(): Promise<boolean> {
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
