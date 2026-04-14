/**
 * OpenRouter Configuration — TEMPLATE
 *
 * Copy this file to `openrouter-config.ts` (which is gitignored) and fill in
 * your real API key from https://openrouter.ai/keys
 *
 * The real `openrouter-config.ts` file holds the API key that ships baked into
 * the desktop app. Every user of the app spends from THIS account, so:
 *   - Set a hard credit cap on https://openrouter.ai/credits
 *   - Set per-key rate limits in the OpenRouter dashboard
 *   - Monitor usage daily for the first weeks after launch
 */

export const OPENROUTER_API_KEY = 'sk-or-v1-REPLACE_WITH_YOUR_KEY';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_APP_NAME = 'PersonaHub Desktop';
export const OPENROUTER_APP_URL = 'https://personahub.app';

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
