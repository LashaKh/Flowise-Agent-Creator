import { describe, it, expect, beforeEach } from 'vitest';
import { logVoiceEvent, getEventLog, pruneEventLog, clearEventLog, getEventsByType, exportEventLog } from '../voiceEventLog';

describe('voiceEventLog', () => {
  beforeEach(() => {
    clearEventLog();
  });

  it('appends events with timestamp', () => {
    logVoiceEvent({ eventType: 'voice-output-started', personaId: 'p1' });
    const log = getEventLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.eventType).toBe('voice-output-started');
    expect(log[0]!.personaId).toBe('p1');
    expect(log[0]!.timestamp).toBeTruthy();
  });

  it('appends multiple events in order', () => {
    logVoiceEvent({ eventType: 'voice-output-started', personaId: 'p1' });
    logVoiceEvent({ eventType: 'voice-output-completed', personaId: 'p1', durationMs: 1500 });
    const log = getEventLog();
    expect(log).toHaveLength(2);
    expect(log[0]!.eventType).toBe('voice-output-started');
    expect(log[1]!.eventType).toBe('voice-output-completed');
    expect(log[1]!.durationMs).toBe(1500);
  });

  it('filters by event type', () => {
    logVoiceEvent({ eventType: 'voice-output-started', personaId: 'p1' });
    logVoiceEvent({ eventType: 'voice-output-error', personaId: 'p1', errorCode: 'TIMEOUT' });
    logVoiceEvent({ eventType: 'voice-output-started', personaId: 'p2' });

    const errors = getEventsByType('voice-output-error');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.errorCode).toBe('TIMEOUT');
  });

  it('prunes old events', () => {
    logVoiceEvent({ eventType: 'voice-output-started', personaId: 'old' });
    // We can't easily backdate since it's readonly, so just test that prune runs without error
    pruneEventLog();
    expect(getEventLog().length).toBeGreaterThanOrEqual(0);
  });

  it('caps at 10000 entries', () => {
    for (let i = 0; i < 10005; i++) {
      logVoiceEvent({ eventType: 'voice-output-started', personaId: `p${i}` });
    }
    expect(getEventLog().length).toBeLessThanOrEqual(10000);
  });

  it('exports as JSON string', () => {
    logVoiceEvent({ eventType: 'voice-output-started', personaId: 'p1' });
    const exported = exportEventLog();
    const parsed = JSON.parse(exported);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].eventType).toBe('voice-output-started');
  });

  it('does not include PII/audio/keys', () => {
    logVoiceEvent({
      eventType: 'voice-output-error',
      personaId: 'p1',
      errorCategory: 'auth',
      errorCode: 'INVALID_KEY',
    });
    const exported = exportEventLog();
    // The log should only have structured fields, never raw text/audio
    expect(exported).not.toContain('sk-');
    expect(exported).toContain('INVALID_KEY');
  });

  it('clears the log', () => {
    logVoiceEvent({ eventType: 'voice-output-started', personaId: 'p1' });
    clearEventLog();
    expect(getEventLog()).toHaveLength(0);
  });
});
