/**
 * ActionGuard — The central security checkpoint for all tool calls.
 *
 * Every action a persona wants to take passes through here, like airport
 * security. The guard checks:
 * 1. Is this tool even allowed? (tool tier check)
 * 2. Is the persona allowed to use it? (enabledTools check)
 * 3. Is the target path safe? (path validation)
 * 4. Has the user already approved this? (permission memory)
 * 5. Based on the user's paranoia level, should we ask? (confirmation level)
 */
import { getToolTier } from '../src/constants/security';
import { validatePath } from './path-validator';
import { checkPermission } from './permission-memory';
import { getDatabase } from '../db/init';
import type {
  ActionRequest,
  ActionEvaluation,
  ActionLogEntry,
  PersonaConfig,
  ToolTier,
} from '../src/types';

// Tools that involve writing to a path (need write-level path permission)
const WRITE_TOOLS = new Set(['write', 'edit', 'delete']);

/**
 * Evaluate whether an action should be allowed, denied, or needs confirmation.
 *
 * Decision tree:
 * 1. Blocked tool → deny
 * 2. Dangerous tool + not enabled → deny
 * 3. Tool not in persona's enabledTools → deny
 * 4. Target path blocked or outside allowed dirs → deny
 * 5. Permission memory says allow/block → follow it
 * 6. Check confirmation level to decide if we ask or auto-allow
 */
export function evaluateAction(
  request: ActionRequest,
  persona: PersonaConfig
): ActionEvaluation {
  const tier = getToolTier(request.tool);

  // 1. Unknown or blocked tools are always denied
  if (tier === 'blocked') {
    return {
      result: 'deny',
      reason: `Tool "${request.tool}" is blocked`,
      tier,
    };
  }

  // 2. Dangerous tools require explicit opt-in
  if (tier === 'dangerous' && !persona.dangerousToolsEnabled) {
    return {
      result: 'deny',
      reason: `Dangerous tool "${request.tool}" is not enabled for this persona`,
      tier,
    };
  }

  // 3. Tool must be in persona's enabled list
  if (!persona.enabledTools.includes(request.tool)) {
    return {
      result: 'deny',
      reason: `Tool "${request.tool}" is not enabled for persona "${persona.name}"`,
      tier,
    };
  }

  // 4. If the action targets a file path, validate it
  if (request.target) {
    const action = WRITE_TOOLS.has(request.tool) ? 'write' : 'read';
    const pathResult = validatePath(request.target, persona.allowedPaths, action);

    if (!pathResult.valid) {
      return {
        result: 'deny',
        reason: pathResult.reason,
        tier,
      };
    }
  }

  // 5. Check permission memory for a stored decision
  const storedPermission = checkPermission(
    persona.id,
    request.tool,
    request.target
  );

  if (storedPermission === 'allow') {
    return { result: 'allow', tier };
  }

  if (storedPermission === 'block') {
    return {
      result: 'deny',
      reason: 'Blocked by saved permission',
      tier,
    };
  }

  // 6. Decide based on persona's confirmation level
  return evaluateByConfirmationLevel(persona.confirmationLevel, tier);
}

/**
 * Map the confirmation level to a decision for the given tool tier.
 *
 * paranoid:  confirm everything (even safe tools)
 * balanced:  confirm guarded + dangerous (default)
 * relaxed:   confirm dangerous only
 * trust:     confirm nothing (auto-allow everything that passed checks above)
 */
function evaluateByConfirmationLevel(
  level: PersonaConfig['confirmationLevel'],
  tier: ToolTier
): ActionEvaluation {
  switch (level) {
    case 'paranoid':
      return { result: 'confirm', tier };

    case 'balanced':
      if (tier === 'guarded' || tier === 'dangerous') {
        return { result: 'confirm', tier };
      }
      return { result: 'allow', tier };

    case 'relaxed':
      if (tier === 'dangerous') {
        return { result: 'confirm', tier };
      }
      return { result: 'allow', tier };

    case 'trust':
      return { result: 'allow', tier };

    default:
      // Unknown level — play it safe
      return { result: 'confirm', tier };
  }
}

/**
 * Log an action to the SQLite database.
 */
export function logAction(entry: ActionLogEntry): ActionLogEntry {
  return getDatabase().insertActionLog({
    personaId: entry.personaId,
    tool: entry.tool,
    action: entry.action,
    target: entry.target,
    contentPreview: entry.contentPreview,
    result: entry.result,
    denyReason: entry.denyReason,
    backupId: entry.backupId,
  });
}

/**
 * Get the action log, optionally filtered by persona.
 */
export function getActionLog(personaId?: string): ActionLogEntry[] {
  return personaId
    ? getDatabase().getActionLogsByPersona(personaId)
    : getDatabase().getAllActionLogs();
}
