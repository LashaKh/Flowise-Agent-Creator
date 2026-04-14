/**
 * ModelPicker — visual card grid for selecting an AI model.
 *
 * Each card is a clickable button. The selected card gets an indigo ring.
 * Cards show emoji + label + tagline + price tier + optional badge.
 *
 * No API key prompts, no provider setup — the OpenRouter key is pre-baked
 * into the desktop app, so users just click a model and chat.
 */
import { MODEL_CATALOG, type ModelOption, type ModelBadge } from '../constants/models';

interface ModelPickerProps {
  /** Currently selected model ID (empty string = default) */
  value: string;
  /** Called when the user picks a different model */
  onChange: (modelId: string) => void;
}

const BADGE_STYLES: Record<ModelBadge, string> = {
  RECOMMENDED: 'bg-indigo-900/60 text-indigo-300 border-indigo-700',
  PREMIUM: 'bg-purple-900/60 text-purple-300 border-purple-700',
  'LONG CONTEXT': 'bg-blue-900/60 text-blue-300 border-blue-700',
  MULTILINGUAL: 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
};

const PRICE_STYLES: Record<string, string> = {
  '$': 'text-emerald-400',
  '$$': 'text-yellow-400',
  '$$$': 'text-orange-400',
};

export default function ModelPicker({ value, onChange }: ModelPickerProps) {
  // Group models by backend so the open-source options are grouped together
  // and the existing Claude/Gemini options sit underneath.
  const openRouterModels = MODEL_CATALOG.filter((m) => m.backend === 'openrouter');
  const openClawModels = MODEL_CATALOG.filter((m) => m.backend === 'openclaw');

  return (
    <div className="space-y-4">
      {/* Open Source group */}
      <div>
        <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
          <span>Open Source · Pay-per-token</span>
          <span className="text-[9px] font-normal text-gray-600 normal-case">via OpenRouter</span>
        </h4>
        <div className="grid grid-cols-1 gap-2">
          {openRouterModels.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              isSelected={value === model.id}
              onClick={() => onChange(model.id)}
            />
          ))}
        </div>
      </div>

      {/* Premium group */}
      {openClawModels.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span>Premium · Bring-your-own-key</span>
            <span className="text-[9px] font-normal text-gray-600 normal-case">via OpenClaw gateway</span>
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {openClawModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                isSelected={value === model.id}
                onClick={() => onChange(model.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ModelCardProps {
  model: ModelOption;
  isSelected: boolean;
  onClick: () => void;
}

function ModelCard({ model, isSelected, onClick }: ModelCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={model.priceDetail}
      className={`text-left rounded-lg border p-3 transition-all relative
        ${isSelected
          ? 'border-indigo-500 bg-indigo-600/10 ring-2 ring-indigo-500/30'
          : 'border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-800/70'
        }`}
    >
      <div className="flex items-start gap-3">
        {/* Emoji */}
        <span className="text-2xl leading-none mt-0.5" aria-hidden>
          {model.emoji}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">{model.label}</span>
            {model.badge && (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${BADGE_STYLES[model.badge]}`}
              >
                {model.badge}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 leading-snug">{model.tagline}</p>
          <p className="text-[10px] text-gray-600 mt-1 font-mono">{model.priceDetail}</p>
        </div>

        {/* Price tier indicator */}
        <span
          className={`text-base font-bold tabular-nums shrink-0 ${PRICE_STYLES[model.priceTier]}`}
          aria-label={`Price tier ${model.priceTier}`}
        >
          {model.priceTier}
        </span>
      </div>

      {/* Selected checkmark */}
      {isSelected && (
        <span className="absolute top-2 right-2 text-indigo-400 text-xs">✓</span>
      )}
    </button>
  );
}
