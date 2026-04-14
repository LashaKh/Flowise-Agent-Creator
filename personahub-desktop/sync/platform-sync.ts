/**
 * PlatformSync — Keeps local personas in sync with the web platform.
 *
 * Think of it like email sync: periodically checks the server for changes
 * and updates the local database to match. Also detects when a persona
 * gets new permissions (like a new tool or folder access) and flags it.
 *
 * Runs in the main process — uses the LocalDB directly, not IPC.
 */
import type { PersonaConfig, PermissionEscalation } from '../src/types';
import { getDatabase } from '../db/init';

const SUPABASE_URL = 'https://wlvfilxtvqjzwqjhfcdk.supabase.co';

export interface SyncResult {
  success: boolean;
  personaCount: number;
  escalations: PermissionEscalation[];
  error?: string;
}

let pollIntervalId: ReturnType<typeof setInterval> | null = null;

// ─── Sync Personas ───────────────────────────────

export async function syncPersonas(accessToken: string): Promise<SyncResult> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/personas`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, personaCount: 0, escalations: [], error: `Fetch failed: ${response.status}` };
    }

    const remotePersonas: PersonaConfig[] = await response.json();
    const escalations: PermissionEscalation[] = [];
    const db = getDatabase();

    for (const persona of remotePersonas) {
      // Check for existing local persona to detect escalations
      const existing = db.getPersonaById(persona.id);
      if (existing) {
        const escalation = detectEscalations(existing, persona);
        if (escalation) escalations.push(escalation);
      }

      // Upsert persona to local database
      db.upsertPersona({
        ...persona,
        syncedAt: new Date().toISOString(),
      });
    }

    return { success: true, personaCount: remotePersonas.length, escalations };
  } catch (error) {
    return {
      success: false,
      personaCount: 0,
      escalations: [],
      error: error instanceof Error ? error.message : 'Sync failed',
    };
  }
}

// ─── Polling ─────────────────────────────────────

export function startPolling(accessToken: string, intervalMs: number = 30000): void {
  stopPolling();
  pollIntervalId = setInterval(() => {
    syncPersonas(accessToken);
  }, intervalMs);
}

export function stopPolling(): void {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

// ─── Escalation Detection ────────────────────────

export function detectEscalations(
  oldConfig: PersonaConfig,
  newConfig: PersonaConfig
): PermissionEscalation | null {
  const oldTools = new Set(oldConfig.enabledTools ?? []);
  const newTools = (newConfig.enabledTools ?? []).filter((t) => !oldTools.has(t));

  const oldPathKeys = new Set((oldConfig.allowedPaths ?? []).map((p) => `${p.path}:${p.mode}`));
  const newPaths = (newConfig.allowedPaths ?? []).filter(
    (p) => !oldPathKeys.has(`${p.path}:${p.mode}`)
  );

  const dangerousEnabled =
    !oldConfig.dangerousToolsEnabled && newConfig.dangerousToolsEnabled;

  if (newTools.length === 0 && newPaths.length === 0 && !dangerousEnabled) {
    return null;
  }

  return {
    personaId: newConfig.id,
    personaName: newConfig.name,
    changes: {
      newTools,
      newPaths,
      dangerousEnabled,
    },
  };
}
