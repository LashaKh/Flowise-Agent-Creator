/**
 * Model Catalog — the single source of truth for all selectable LLMs.
 *
 * Used by:
 *   - ModelPicker.tsx   → renders the cards
 *   - UsagePanel.tsx    → labels per-model spend
 *   - agent-bridge.ts   → indirectly via DEFAULT_MODEL_ID
 *
 * If you add/remove a model here, also update OPENROUTER_MODEL_IDS in
 * `electron/openrouter-config.ts` so the routing branch stays in sync.
 */

export type ModelBackend = 'openclaw' | 'openrouter';
export type ModelBadge = 'RECOMMENDED' | 'PREMIUM' | 'LONG CONTEXT' | 'MULTILINGUAL';
export type PriceTier = '$' | '$$' | '$$$';

export interface ModelOption {
  /** OpenRouter model slug or OpenClaw model name */
  id: string;
  /** Routing target — picks which client the agent-bridge uses */
  backend: ModelBackend;
  /** Display name */
  label: string;
  /** Emoji shown on the card */
  emoji: string;
  /** One-line description shown under the name */
  tagline: string;
  /** Visual price tier ($ = cheap, $$$ = premium) */
  priceTier: PriceTier;
  /** Exact pricing string for tooltip/footer */
  priceDetail: string;
  /** Optional badge in the corner of the card */
  badge?: ModelBadge;
}

export const MODEL_CATALOG: ModelOption[] = [
  // ─── OpenRouter (open-source, pre-configured key) ─────────────────
  {
    id: 'deepseek/deepseek-v3.2',
    backend: 'openrouter',
    label: 'DeepSeek V3.2',
    emoji: '🥇',
    tagline: 'Fast, cheap, great quality — default choice',
    priceTier: '$',
    priceDetail: '$0.26 / $0.38 per 1M tokens',
    badge: 'RECOMMENDED',
  },
  {
    id: 'meta-llama/llama-4-maverick',
    backend: 'openrouter',
    label: 'Llama 4 Maverick',
    emoji: '🥈',
    tagline: 'Warmer personality, better for personas',
    priceTier: '$',
    priceDetail: '$0.15 / $0.60 per 1M tokens',
  },
  {
    id: 'meta-llama/llama-4-scout',
    backend: 'openrouter',
    label: 'Llama 4 Scout',
    emoji: '🥉',
    tagline: '10M token context — for personas with huge knowledge bases',
    priceTier: '$',
    priceDetail: '$0.08 / $0.30 per 1M tokens',
    badge: 'LONG CONTEXT',
  },
  {
    id: 'qwen/qwen3.5-122b-a10b',
    backend: 'openrouter',
    label: 'Qwen 3.5',
    emoji: '🌏',
    tagline: 'Best multilingual — strong across 140+ languages',
    priceTier: '$$',
    priceDetail: '$0.26 / $2.08 per 1M tokens',
    badge: 'MULTILINGUAL',
  },
  {
    id: 'moonshotai/kimi-k2.5',
    backend: 'openrouter',
    label: 'Kimi K2.5',
    emoji: '💎',
    tagline: 'Excellent conversation, premium tier',
    priceTier: '$$$',
    priceDetail: '$0.38 / $1.72 per 1M tokens',
    badge: 'PREMIUM',
  },

  // ─── OpenClaw (Claude / Gemini via your existing gateway) ─────────
  {
    id: 'claude-sonnet-4-5',
    backend: 'openclaw',
    label: 'Claude Sonnet 4.5',
    emoji: '🧠',
    tagline: 'Best-in-class quality (uses your Anthropic key)',
    priceTier: '$$$',
    priceDetail: '$3 / $15 per 1M tokens',
  },
  {
    id: 'gemini-2.5-flash',
    backend: 'openclaw',
    label: 'Gemini 2.5 Flash',
    emoji: '⚡',
    tagline: 'Fast Google model (uses your Google key)',
    priceTier: '$',
    priceDetail: 'low cost',
  },
];

/**
 * Default model used when a persona has no `settings.modelName` set.
 * DeepSeek V3.2 is the cheapest open-source option with great chat quality.
 */
export const DEFAULT_MODEL_ID = 'deepseek/deepseek-v3.2';

/** Lookup helper used by UsagePanel to resolve a model ID back to its label/emoji. */
export function getModelById(id: string): ModelOption | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}
