/**
 * OpenClaw Agent Bridge
 *
 * Manages running AI agent instances — one per active persona.
 * Routes tool calls through the ActionGuard (security layer) before execution.
 *
 * Think of this as a "control room" that starts/stops agents and monitors
 * everything they try to do.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { PersonaConfig, ActionRequest, ActionEvaluation } from '../src/types';
import { createAgentConfig, registerAgentInConfig, unregisterAgentFromConfig } from './config-factory';
import type { OpenClawConfig } from './config-factory';
import * as openClawClient from '../electron/openclaw-client';

// Active agent instances keyed by persona ID
const activeAgents = new Map<string, AgentInstance>();

// Unique per app-start so old gateway sessions with stale history don't carry over
const SESSION_EPOCH = Date.now();

interface AgentInstance {
  personaId: string;
  config: OpenClawConfig;
  isRunning: boolean;
}

// Callback type for streaming responses
type ResponseCallback = (chunk: { personaId: string; content: string; done: boolean }) => void;
type ToolCallCallback = (toolCall: { personaId: string; tool: string; action: string }) => void;

let onResponseCallback: ResponseCallback | null = null;
let onToolCallCallback: ToolCallCallback | null = null;

// ActionGuard function — injected from security module
let actionGuardFn: ((request: ActionRequest, persona: PersonaConfig) => Promise<ActionEvaluation>) | null = null;

/**
 * Inject the ActionGuard function (called during app initialization).
 * This avoids circular dependencies between the bridge and security modules.
 */
export function setActionGuard(
  guard: (request: ActionRequest, persona: PersonaConfig) => Promise<ActionEvaluation>
) {
  actionGuardFn = guard;
}

/**
 * Start an agent for a persona.
 */
export async function startAgent(persona: PersonaConfig): Promise<void> {
  if (activeAgents.has(persona.id)) {
    return; // Already running
  }

  const config = createAgentConfig(persona);

  // Register with OpenClaw gateway so it knows about this agent
  registerAgentInConfig(persona.id, config.workspacePath);

  const instance: AgentInstance = {
    personaId: persona.id,
    config,
    isRunning: true,
  };

  activeAgents.set(persona.id, instance);
}

/**
 * Stop an agent.
 */
export async function stopAgent(personaId: string): Promise<void> {
  const instance = activeAgents.get(personaId);
  if (!instance) return;

  instance.isRunning = false;
  activeAgents.delete(personaId);

  // Remove from OpenClaw gateway config
  unregisterAgentFromConfig(personaId);
}

/**
 * Read all .md files from the persona's knowledge/ folder and append
 * them to the system prompt so the AI can reference uploaded documents.
 */
function buildSystemPromptWithKnowledge(personaId: string, basePrompt: string): string {
  const knowledgeDir = path.join(os.homedir(), '.openclaw', 'agents', personaId, 'knowledge');
  if (!fs.existsSync(knowledgeDir)) return basePrompt;

  const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) return basePrompt;

  const docs = files.map(f => {
    const title = path.basename(f, '.md');
    const content = fs.readFileSync(path.join(knowledgeDir, f), 'utf-8');
    return `## ${title}\n${content}`;
  });

  return `${basePrompt}\n\n---\n# Knowledge Base Documents\nThe following documents have been uploaded to your knowledge base. Reference them when answering related questions.\n\n${docs.join('\n\n---\n\n')}`;
}

/**
 * Send a message to a persona's agent and stream the response.
 *
 * This is the main entry point for chat. The flow:
 * 1. User sends message
 * 2. Agent processes and may make tool calls
 * 3. Each tool call goes through ActionGuard
 * 4. If allowed, tool executes; if needs confirm, UI is notified
 * 5. Response is streamed back chunk by chunk
 */
export async function sendMessage(
  personaId: string,
  message: string,
  _persona: PersonaConfig
): Promise<void> {
  const instance = activeAgents.get(personaId);
  if (!instance || !instance.isRunning) {
    throw new Error(`No active agent for persona ${personaId}`);
  }

  // Session key includes startup epoch so old tool-less history doesn't carry over
  const sessionKey = `${personaId}-${SESSION_EPOCH}`;

  // Stream the response from OpenClaw through the callback
  // Pass the system prompt so the AI knows who this persona is
  // Build system prompt with knowledge docs appended
  const systemPrompt = buildSystemPromptWithKnowledge(personaId, _persona.systemPrompt);

  console.log('[agent-bridge] sendMessage:', {
    personaId,
    hasSystemPrompt: !!systemPrompt,
    systemPromptLength: systemPrompt?.length ?? 0,
    systemPromptPreview: systemPrompt?.slice(0, 80),
  });
  const modelOverride = _persona.settings?.modelName || undefined;
  await openClawClient.sendMessage(personaId, message, sessionKey, (content, done) => {
    onResponseCallback?.({ personaId, content, done });
  }, systemPrompt, modelOverride, _persona.enabledTools);
}

/**
 * Handle a tool call from the agent — route through ActionGuard.
 */
export async function handleToolCall(
  personaId: string,
  tool: string,
  action: string,
  target: string | undefined,
  content: string | undefined,
  persona: PersonaConfig
): Promise<ActionEvaluation> {
  const request: ActionRequest = {
    tool,
    action,
    target,
    content,
    personaId,
  };

  // Notify UI about the tool call
  onToolCallCallback?.({ personaId, tool, action });

  // Run through ActionGuard
  if (actionGuardFn) {
    return actionGuardFn(request, persona);
  }

  // Placeholder guard: allow safe tools only
  const safeTier = ['read', 'ls', 'web_search', 'web_fetch', 'memory_search', 'calendar.read', 'weather'];
  if (safeTier.includes(tool)) {
    return { result: 'allow', tier: 'safe' };
  }

  return { result: 'deny', tier: 'blocked', reason: 'Security layer not initialized' };
}

/**
 * Register callbacks for streaming responses.
 */
export function onResponse(callback: ResponseCallback) {
  onResponseCallback = callback;
}

export function onToolCall(callback: ToolCallCallback) {
  onToolCallCallback = callback;
}

/**
 * Initialize the agent bridge — connects the WebSocket approval channel
 * so tool calls from OpenClaw flow through our ActionGuard.
 */
export function initAgentBridge(): void {
  openClawClient.connectApprovalWebSocket(async (request) => {
    // Find which persona this approval is for (use first active agent as fallback)
    const firstAgent = activeAgents.values().next().value as AgentInstance | undefined;
    if (!firstAgent) {
      openClawClient.resolveApproval(request.requestId, false);
      return;
    }

    // Notify UI about the tool call
    onToolCallCallback?.({
      personaId: firstAgent.personaId,
      tool: request.tool,
      action: request.action,
    });

    // Route through ActionGuard if available
    if (actionGuardFn) {
      const actionRequest: ActionRequest = {
        tool: request.tool,
        action: request.action,
        target: request.target,
        content: request.content,
        personaId: firstAgent.personaId,
      };

      // We need the persona config — for now use a minimal stub
      // The main process should inject a persona lookup function
      const evaluation = await actionGuardFn(actionRequest, {} as PersonaConfig);
      openClawClient.resolveApproval(request.requestId, evaluation.result === 'allow');
    } else {
      // No guard — deny by default
      openClawClient.resolveApproval(request.requestId, false);
    }
  });
}

/**
 * Stop all running agents.
 */
export async function stopAllAgents(): Promise<void> {
  for (const [personaId] of activeAgents) {
    await stopAgent(personaId);
  }
}

/**
 * Get IDs of all running agents.
 */
export function getActiveAgentIds(): string[] {
  return Array.from(activeAgents.keys());
}
