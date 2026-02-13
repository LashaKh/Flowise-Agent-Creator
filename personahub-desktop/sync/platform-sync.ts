/**
 * PlatformSync — Keeps local personas in sync with the web platform.
 *
 * Think of it like email sync: periodically checks the server for changes
 * and updates the local database to match. Also detects when a persona
 * gets new permissions (like a new tool or folder access) and flags it.
 */
import type { PersonaConfig, PermissionEscalation } from '../src/types';

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

    for (const persona of remotePersonas) {
      // Check for existing local persona to detect escalations
      try {
        const existing = await window.electronAPI.db.get(
          'SELECT * FROM personas WHERE id = ?',
          [persona.id]
        ) as PersonaConfig | undefined;

        if (existing) {
          const escalation = detectEscalations(existing, persona);
          if (escalation) {
            escalations.push(escalation);
          }
        }
      } catch {
        // No local record yet — first sync, no escalation check needed
      }

      // Upsert persona to local database
      await window.electronAPI.db.run(
        `INSERT INTO personas (id, user_id, name, system_prompt, chatflow_id, api_endpoint, status, enabled_tools, allowed_paths, blocked_paths, confirmation_level, dangerous_tools_enabled, activity_logging, undo_enabled, sandbox_enabled, settings, synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           system_prompt = excluded.system_prompt,
           chatflow_id = excluded.chatflow_id,
           api_endpoint = excluded.api_endpoint,
           status = excluded.status,
           enabled_tools = excluded.enabled_tools,
           allowed_paths = excluded.allowed_paths,
           blocked_paths = excluded.blocked_paths,
           confirmation_level = excluded.confirmation_level,
           dangerous_tools_enabled = excluded.dangerous_tools_enabled,
           activity_logging = excluded.activity_logging,
           undo_enabled = excluded.undo_enabled,
           sandbox_enabled = excluded.sandbox_enabled,
           settings = excluded.settings,
           synced_at = excluded.synced_at,
           updated_at = excluded.updated_at`,
        [
          persona.id,
          persona.userId,
          persona.name,
          persona.systemPrompt,
          persona.chatflowId,
          persona.apiEndpoint,
          persona.status,
          JSON.stringify(persona.enabledTools ?? []),
          JSON.stringify(persona.allowedPaths ?? []),
          JSON.stringify(persona.blockedPaths ?? []),
          persona.confirmationLevel ?? 'balanced',
          persona.dangerousToolsEnabled ? 1 : 0,
          persona.activityLogging ? 1 : 0,
          persona.undoEnabled ? 1 : 0,
          persona.sandboxEnabled ? 1 : 0,
          JSON.stringify(persona.settings ?? {}),
          new Date().toISOString(),
          persona.createdAt,
          persona.updatedAt,
        ]
      );
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
