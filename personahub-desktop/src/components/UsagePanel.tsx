/**
 * UsagePanel — small cost dashboard for current-month LLM usage.
 *
 * Reads from `electronAPI.llm.getUsage()` which aggregates the JSONL log
 * written by openrouter-client.ts after each successful response.
 *
 * Polls every 30s while visible. Manual refresh button included.
 */
import { useEffect, useState } from 'react';
import { getModelById } from '../constants/models';

interface UsageSummary {
  totalCostUsd: number;
  totalTokens: number;
  totalRequests: number;
  perModel: Record<string, { costUsd: number; tokens: number; requests: number }>;
}

const REFRESH_INTERVAL_MS = 30_000;

export default function UsagePanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await window.electronAPI.llm.getUsage();
      setUsage(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="text-xs text-gray-500 py-2 flex items-center gap-2">
        <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin inline-block" />
        Loading usage...
      </div>
    );
  }

  if (error) {
    return <div className="text-xs text-red-400 py-2">Error: {error}</div>;
  }

  if (!usage || usage.totalRequests === 0) {
    return (
      <div className="text-xs text-gray-500 bg-gray-800/50 rounded p-3">
        No AI usage tracked yet this month. Send a message in any persona to see costs here.
      </div>
    );
  }

  // Sort models by spend (highest first)
  const sortedModels = Object.entries(usage.perModel).sort(
    ([, a], [, b]) => b.costUsd - a.costUsd,
  );

  const monthName = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-3">
      {/* Header line */}
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">{monthName}</span>
        <button
          onClick={refresh}
          className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Total spent */}
      <div className="bg-gray-800/60 rounded-lg p-3 flex items-baseline justify-between">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Total spent</div>
          <div className="text-2xl font-semibold text-white tabular-nums">
            ${usage.totalCostUsd.toFixed(4)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-0.5">Messages</div>
          <div className="text-sm text-gray-300 tabular-nums">
            {usage.totalRequests.toLocaleString()}
          </div>
          <div className="text-[10px] text-gray-600 tabular-nums mt-0.5">
            {usage.totalTokens.toLocaleString()} tokens
          </div>
        </div>
      </div>

      {/* Per-model breakdown */}
      {sortedModels.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
            By model
          </div>
          {sortedModels.map(([modelId, stats]) => {
            const meta = getModelById(modelId);
            return (
              <div
                key={modelId}
                className="flex items-center justify-between bg-gray-800/40 rounded px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0" aria-hidden>
                    {meta?.emoji ?? '🤖'}
                  </span>
                  <span className="text-xs text-gray-300 truncate">
                    {meta?.label ?? modelId}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 shrink-0">
                  <span className="text-xs text-white tabular-nums">
                    ${stats.costUsd.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-gray-500 tabular-nums">
                    ({stats.requests})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-gray-600 leading-relaxed">
        Costs reflect actual charges from OpenRouter. Logged locally — no telemetry sent.
      </p>
    </div>
  );
}
