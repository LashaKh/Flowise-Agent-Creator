/**
 * Voice event log — local diagnostic log for troubleshooting.
 * Append-only, 7-day retention, auto-prune on start.
 * NO PII, NO audio, NO API keys, NO reply/transcription text.
 */

export type VoiceEventType =
  | 'voice-output-started'
  | 'voice-output-completed'
  | 'voice-output-fallback'
  | 'voice-output-error'
  | 'mic-session-started'
  | 'mic-session-completed'
  | 'mic-session-denied'
  | 'mic-session-error'
  | 'provider-switch'
  | 'model-download-started'
  | 'model-download-completed';

export interface VoiceEvent {
  timestamp: string;
  eventType: VoiceEventType;
  personaId?: string;
  providerUsed?: string;
  durationMs?: number;
  errorCategory?: string;
  errorCode?: string;
}

const MAX_ENTRIES = 10_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let eventLog: VoiceEvent[] = [];

/** Append a voice event to the log */
export function logVoiceEvent(event: Omit<VoiceEvent, 'timestamp'>): void {
  const entry: VoiceEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  eventLog.push(entry);

  // Hard cap
  if (eventLog.length > MAX_ENTRIES) {
    eventLog = eventLog.slice(-MAX_ENTRIES);
  }
}

/** Prune entries older than 7 days. Called on app start. */
export function pruneEventLog(): void {
  const cutoff = Date.now() - RETENTION_MS;
  eventLog = eventLog.filter((e) => new Date(e.timestamp).getTime() > cutoff);
}

/** Get all events (read-only snapshot) */
export function getEventLog(): readonly VoiceEvent[] {
  return eventLog;
}

/** Get events filtered by type */
export function getEventsByType(type: VoiceEventType): readonly VoiceEvent[] {
  return eventLog.filter((e) => e.eventType === type);
}

/** Clear the log (for testing) */
export function clearEventLog(): void {
  eventLog = [];
}

/** Export log for diagnostics (already contains no PII/audio/keys) */
export function exportEventLog(): string {
  return JSON.stringify(eventLog, null, 2);
}
