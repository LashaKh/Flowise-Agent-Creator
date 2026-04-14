/**
 * LLM Usage Log — append-only JSONL file tracking cost per request.
 *
 * Pattern lifted from `src/lib/speech/voiceEventLog.ts` but persisted to disk
 * (since usage spans across app restarts). Each line is one JSON entry.
 *
 * NO PII, NO message content, NO API keys — just metadata + cost.
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface LlmUsageEntry {
  ts: string;              // ISO timestamp
  personaId: string;
  model: string;           // e.g. 'deepseek/deepseek-v3.2'
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LlmUsageSummary {
  totalCostUsd: number;
  totalTokens: number;
  totalRequests: number;
  perModel: Record<string, {
    costUsd: number;
    tokens: number;
    requests: number;
  }>;
}

function getLogPath(): string {
  return path.join(app.getPath('userData'), 'llm-usage.jsonl');
}

/** Append a single usage entry. Called after each successful LLM response. */
export function appendLlmUsage(entry: Omit<LlmUsageEntry, 'ts'>): void {
  const full: LlmUsageEntry = { ts: new Date().toISOString(), ...entry };
  try {
    fs.appendFileSync(getLogPath(), JSON.stringify(full) + '\n', 'utf-8');
  } catch (err) {
    // Best-effort logging — never crash the app on a write failure
    console.warn('[llm-usage-log] Failed to append entry:', (err as Error).message);
  }
}

/**
 * Read the log and return aggregate stats for the current calendar month.
 * Returns zeros if no entries exist yet.
 */
export function getMonthlySummary(): LlmUsageSummary {
  const summary: LlmUsageSummary = {
    totalCostUsd: 0,
    totalTokens: 0,
    totalRequests: 0,
    perModel: {},
  };

  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) return summary;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let raw: string;
  try {
    raw = fs.readFileSync(logPath, 'utf-8');
  } catch (err) {
    console.warn('[llm-usage-log] Failed to read log:', (err as Error).message);
    return summary;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry: LlmUsageEntry = JSON.parse(trimmed);
      const ts = new Date(entry.ts).getTime();
      if (ts < monthStart) continue;

      summary.totalCostUsd += entry.costUsd || 0;
      summary.totalTokens += (entry.inputTokens || 0) + (entry.outputTokens || 0);
      summary.totalRequests += 1;

      const m = entry.model || 'unknown';
      if (!summary.perModel[m]) {
        summary.perModel[m] = { costUsd: 0, tokens: 0, requests: 0 };
      }
      summary.perModel[m].costUsd += entry.costUsd || 0;
      summary.perModel[m].tokens += (entry.inputTokens || 0) + (entry.outputTokens || 0);
      summary.perModel[m].requests += 1;
    } catch {
      // Skip malformed line
    }
  }

  return summary;
}
