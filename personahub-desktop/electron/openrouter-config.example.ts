/**
 * OpenRouter Configuration — TEMPLATE
 *
 * This is now a reference file. The real `openrouter-config.ts` no longer
 * bundles an API key — keys are user-provided at runtime via Settings →
 * AI & Models and persisted through `voice-key-store.ts` (safeStorage).
 *
 * If you're a dev who needs to smoke-test OpenRouter locally:
 *   1. pnpm dev
 *   2. Open the app → Settings → AI & Models → paste your dev key
 *   3. The key is encrypted with OS keychain and never checked into git.
 *
 * There's no longer an `OPENROUTER_API_KEY` constant in the real config.
 */

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_APP_NAME = 'PersonaHub Desktop';
export const OPENROUTER_APP_URL = 'https://personahub.app';

/**
 * Authoritative list of model IDs that get routed through OpenRouter.
 * Keep in sync with MODEL_CATALOG in src/constants/models.ts.
 */
export const OPENROUTER_MODEL_IDS = new Set<string>([
  'deepseek/deepseek-v3.2',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-scout',
  'qwen/qwen3.5-122b-a10b',
  'moonshotai/kimi-k2.5',
]);
