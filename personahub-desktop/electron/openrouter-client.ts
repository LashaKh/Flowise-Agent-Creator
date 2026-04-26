/**
 * OpenRouter Streaming Client — with full tool-call agent loop.
 *
 * Talks to https://openrouter.ai/api/v1/chat/completions over HTTPS.
 *
 * This client does more than stream text: when the model emits tool_calls,
 * we parse them out of the SSE stream, route each one through the
 * ActionGuard (→ Activity Log), execute via `openrouter-tools.ts`, feed
 * results back into `messages[]`, and re-stream until the model returns a
 * final assistant turn. This is the OpenAI function-calling agent loop.
 *
 * Memory: the caller passes a `priorMessages` array (chat history from DB)
 * which gets prepended so the persona actually remembers the conversation.
 */
import https from 'node:https';
import os from 'node:os';
import {
  getOpenRouterApiKey,
  OPENROUTER_APP_NAME,
  OPENROUTER_APP_URL,
} from './openrouter-config';
import { appendLlmUsage } from './llm-usage-log';
import type { PersonaConfig, ActionRequest } from '../src/types';
import { evaluateAction, logAction } from '../security/action-guard';
import { savePermission } from '../security/permission-memory';
import {
  executeTool,
  mapFunctionNameToToolId,
  extractTarget,
  safeParseArgs,
} from './openrouter-tools';

// ---------------------------------------------------------------------------
// Confirmation bridge — main.ts injects this so we can ask the renderer for
// user approval and await it, without creating a cycle between main.ts and
// this file.
// ---------------------------------------------------------------------------

export type ConfirmAskFn = (
  request: ActionRequest,
  personaName: string,
  tier: 'safe' | 'guarded' | 'dangerous' | 'blocked',
  contentPreview?: string,
) => Promise<{ allow: boolean; rememberMinutes?: number; alwaysPathPattern?: string }>;

let confirmAsk: ConfirmAskFn | null = null;

export function setConfirmHandler(fn: ConfirmAskFn) {
  confirmAsk = fn;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChatMessage = Record<string, any>;

type StreamPassResult =
  | { type: 'final'; content: string }
  | { type: 'tools'; calls: ToolCall[]; assistantContent: string };

// ---------------------------------------------------------------------------
// Tool schema catalog — identical function names across openclaw/openrouter
// so the AI sees the same tools regardless of which backend is selected.
// ---------------------------------------------------------------------------

const ALL_TOOLS: Record<string, ToolDef> = {
  read: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at the given absolute path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file (use ~ for home directory)' },
        },
        required: ['path'],
      },
    },
  },
  ls: {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List all files and subdirectories in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the directory (use ~ for home directory)' },
        },
        required: ['path'],
      },
    },
  },
  write: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with the given content',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path for the file' },
          content: { type: 'string', description: 'Content to write to the file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  edit: {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace a specific string in an existing file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
          old_string: { type: 'string', description: 'The exact text to find' },
          new_string: { type: 'string', description: 'The replacement text' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  exec: {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command and return the output',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
  web_search: {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information and return an abstract with relevant links',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  web_fetch: {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and return the text content of a URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
};

function buildToolDefs(enabledTools: string[]): ToolDef[] {
  const defs: ToolDef[] = [];
  for (const t of enabledTools) {
    if (ALL_TOOLS[t]) defs.push(ALL_TOOLS[t]);
  }
  return defs;
}

// ---------------------------------------------------------------------------
// Streaming request — returns either the final text or a pending tool-call set
// ---------------------------------------------------------------------------

async function streamingRequest(
  personaId: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  onChunk: (content: string, done: boolean) => void,
  ignoreProviders?: string[],
  temperature?: number,
): Promise<StreamPassResult> {
  // Provider routing hints — OpenRouter federates each model across multiple
  // upstream providers (Lambda, Together, Groq, DeepInfra, …). Without hints
  // it picks pseudo-randomly, which is why Llama 4 traffic often lands on a
  // saturated provider and 429s. `sort: 'throughput'` prefers the healthiest
  // one and `allow_fallbacks: true` lets OpenRouter try siblings silently.
  const provider: Record<string, unknown> = {
    sort: 'throughput',
    allow_fallbacks: true,
  };
  if (ignoreProviders && ignoreProviders.length > 0) {
    provider.ignore = ignoreProviders;
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    usage: { include: true },
    provider,
  };
  if (tools.length > 0) body.tools = tools;
  // Forward the persona's creativity slider. Without this the setting was a
  // no-op — user moved it, nothing happened, and the model defaulted to
  // whatever upstream preferred.
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.temperature = temperature;
  }
  const payload = JSON.stringify(body);

  // Load the user's OpenRouter key from safeStorage. Reject cleanly if unset
  // so the UI can prompt them to open Settings → AI & Models.
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error(
      'OpenRouter API key not configured. Open Settings → AI & Models and paste your key from https://openrouter.ai/keys.',
    );
  }

  return new Promise<StreamPassResult>((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'openrouter.ai',
        port: 443,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': OPENROUTER_APP_URL,
          'X-Title': OPENROUTER_APP_NAME,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let errBody = '';
          res.on('data', (chunk: Buffer) => { errBody += chunk.toString(); });
          res.on('end', () => {
            // Rate-limit errors get a friendly, actionable message. The caller
            // layer inspects `code` to decide whether to retry. We also try to
            // extract the failed upstream provider (if OpenRouter returned it)
            // so the retry can exclude that provider via `provider.ignore`.
            if (res.statusCode === 429) {
              let failedProvider: string | undefined;
              try {
                const parsed = JSON.parse(errBody) as {
                  error?: { metadata?: { provider_name?: string } };
                };
                failedProvider = parsed?.error?.metadata?.provider_name;
              } catch {
                // Non-JSON body — nothing to extract, proceed with plain retry.
              }
              const err = new Error(
                'This model is temporarily rate-limited upstream. Try again in a minute or pick a different model in Persona Settings.',
              ) as Error & { code?: string; statusCode?: number; failedProvider?: string };
              err.code = 'RATE_LIMITED';
              err.statusCode = 429;
              if (failedProvider) err.failedProvider = failedProvider;
              reject(err);
              return;
            }
            reject(new Error(`OpenRouter request failed (${res.statusCode}): ${errBody.slice(0, 400)}`));
          });
          return;
        }

        let buffer = '';
        let accumulated = '';
        // Tool-call accumulator keyed by index (OpenAI streams fragment them)
        const toolAcc = new Map<number, ToolCall>();
        let finishReason: string | null = null;
        let usageInputTokens = 0;
        let usageOutputTokens = 0;
        let usageCostUsd = 0;
        let resolved = false;

        const finish = () => {
          if (resolved) return;
          resolved = true;

          if (usageInputTokens > 0 || usageOutputTokens > 0 || usageCostUsd > 0) {
            appendLlmUsage({
              personaId,
              model,
              inputTokens: usageInputTokens,
              outputTokens: usageOutputTokens,
              costUsd: usageCostUsd,
            });
          }

          if (finishReason === 'tool_calls' && toolAcc.size > 0) {
            // Sort by index so the calls are in the order the model emitted them
            const calls = Array.from(toolAcc.entries())
              .sort(([a], [b]) => a - b)
              .map(([, c]) => c);
            resolve({ type: 'tools', calls, assistantContent: accumulated });
          } else {
            onChunk(accumulated, true);
            resolve({ type: 'final', content: accumulated });
          }
        };

        res.setEncoding('utf-8');

        res.on('data', (chunk: string) => {
          buffer += chunk;
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            for (const line of trimmed.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);

              if (data === '[DONE]') {
                finish();
                return;
              }

              try {
                const json = JSON.parse(data);
                if (json.usage) {
                  usageInputTokens = json.usage.prompt_tokens || 0;
                  usageOutputTokens = json.usage.completion_tokens || 0;
                  usageCostUsd = json.usage.cost || 0;
                }

                const choice = json.choices?.[0];
                if (!choice) continue;

                const delta = choice.delta ?? {};
                if (typeof delta.content === 'string' && delta.content) {
                  accumulated += delta.content;
                  onChunk(delta.content, false);
                }

                // Tool-call streaming — fragments come in by index.
                // Each fragment may carry: { index, id?, function: { name?, arguments? } }
                if (Array.isArray(delta.tool_calls)) {
                  for (const frag of delta.tool_calls) {
                    const idx: number = typeof frag.index === 'number' ? frag.index : 0;
                    const slot = toolAcc.get(idx) ?? { id: '', name: '', arguments: '' };
                    if (frag.id) slot.id = frag.id;
                    if (frag.function?.name) slot.name += frag.function.name;
                    if (frag.function?.arguments) slot.arguments += frag.function.arguments;
                    toolAcc.set(idx, slot);
                  }
                }

                if (choice.finish_reason) {
                  finishReason = choice.finish_reason;
                }
              } catch (err) {
                console.warn('[openrouter-client] SSE parse error:', (err as Error).message, data.slice(0, 200));
              }
            }
          }
        });

        res.on('end', finish);
      },
    );

    req.on('error', (err) => {
      reject(new Error(`OpenRouter connection failed: ${err.message}`));
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('OpenRouter request timed out'));
    });

    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Tool-call evaluation + execution
// ---------------------------------------------------------------------------

async function evaluateAndExecute(
  call: ToolCall,
  persona: PersonaConfig,
): Promise<unknown> {
  const toolId = mapFunctionNameToToolId(call.name);
  const args = safeParseArgs(call.arguments);
  const target = extractTarget(call.name, args);
  const contentPreview = typeof args.content === 'string' ? args.content : undefined;

  const request: ActionRequest = {
    tool: toolId,
    action: call.name,
    target,
    content: contentPreview,
    personaId: persona.id,
  };

  const evaluation = evaluateAction(request, persona);

  let finalResult: 'allowed' | 'denied' | 'confirmed' = 'denied';
  let denyReason: string | undefined = evaluation.reason;

  if (evaluation.result === 'allow') {
    finalResult = 'allowed';
  } else if (evaluation.result === 'deny') {
    finalResult = 'denied';
  } else {
    // confirm — ask the renderer
    if (confirmAsk) {
      try {
        const decision = await confirmAsk(request, persona.name, evaluation.tier, contentPreview);
        if (decision.allow) {
          finalResult = 'confirmed';
          if (decision.alwaysPathPattern) {
            savePermission({
              personaId: persona.id,
              tool: toolId,
              pathPattern: decision.alwaysPathPattern,
              permission: 'allow_always',
            });
          }
        } else {
          finalResult = 'denied';
          denyReason = 'User denied';
        }
      } catch (err) {
        finalResult = 'denied';
        denyReason = `Confirmation failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      finalResult = 'denied';
      denyReason = 'No confirmation handler registered';
    }
  }

  // Log to SQLite (wrapped so DB hiccups don't break tool flow)
  try {
    logAction({
      personaId: persona.id,
      tool: toolId,
      action: call.name,
      target,
      contentPreview: contentPreview?.slice(0, 500) ?? (call.arguments ? call.arguments.slice(0, 500) : undefined),
      result: finalResult,
      denyReason: finalResult === 'denied' ? denyReason : undefined,
    });
  } catch (err) {
    console.error('[openrouter-client] logAction failed (non-fatal):', err);
  }

  if (finalResult === 'allowed' || finalResult === 'confirmed') {
    try {
      return await executeTool(call.name, args);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { error: denyReason ?? 'Tool call not permitted' };
}

// ---------------------------------------------------------------------------
// sendMessage — main entry point (now with agent loop + memory)
// ---------------------------------------------------------------------------

const MAX_TOOL_ROUNDS = 6;

export async function sendMessage(
  personaId: string,
  message: string,
  onChunk: (content: string, done: boolean) => void,
  systemPrompt: string | undefined,
  modelId: string,
  enabledTools: string[] | undefined,
  priorMessages: Array<{ role: 'user' | 'assistant'; content: string }> | undefined,
  persona: PersonaConfig,
  abortSignal?: AbortSignal,
): Promise<void> {
  const tools = enabledTools?.length ? buildToolDefs(enabledTools) : [];

  const platformName = process.platform === 'darwin' ? 'macOS'
    : process.platform === 'win32' ? 'Windows'
    : 'Linux';
  const envInfo = `\n\nEnvironment: ${platformName}, home directory: ${os.homedir()}, user: ${os.userInfo().username}`;

  const messages: ChatMessage[] = [];

  messages.push({
    role: 'system',
    content: systemPrompt
      ? `${systemPrompt}${envInfo}\n\nIMPORTANT: When the user asks you to perform file operations (read, list, write, create) or search the web, you MUST call your tools to do it. Do NOT just describe what you would do — actually execute the tool.`
      : `You are a helpful AI persona.${envInfo}`,
  });

  // Prior conversation turns — gives the persona memory across messages
  if (priorMessages && priorMessages.length > 0) {
    for (const prior of priorMessages) {
      if (prior.content) {
        messages.push({ role: prior.role, content: prior.content });
      }
    }
  }

  messages.push({ role: 'user', content: message });

  if (process.env.DEBUG_OPENROUTER) {
    console.debug('[openrouter-client] sendMessage:', {
      personaId,
      model: modelId,
      toolCount: tools.length,
      toolNames: tools.map((t) => t.function.name),
      historyLength: priorMessages?.length ?? 0,
    });
  }

  // Agent loop — re-stream until the model stops emitting tool_calls.
  // A single 2-second retry is built in for RATE_LIMITED errors so a brief
  // upstream blip doesn't surface as a hard failure. Only the first round's
  // request is retried; retrying mid-tool-loop could confuse state.
  // Pass-through of the persona's temperature slider. Clamp defensively —
  // OpenRouter / some providers reject values outside [0, 2].
  const rawTemp = persona.settings?.temperature;
  const temperature =
    typeof rawTemp === 'number' && Number.isFinite(rawTemp)
      ? Math.max(0, Math.min(2, rawTemp))
      : undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let pass: StreamPassResult;
    try {
      pass = await streamingRequest(personaId, modelId, messages, tools, onChunk, undefined, temperature);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const failedProvider = (err as { failedProvider?: string }).failedProvider;
      if (code === 'RATE_LIMITED' && round === 0) {
        const ignore = failedProvider ? [failedProvider] : undefined;
        console.warn(
          `[openrouter-client] 429 — retrying once in 2s…${ignore ? ` (ignoring provider: ${ignore.join(', ')})` : ''}`,
        );
        // Abortable sleep: if the user switches personas / hits Stop while
        // we're waiting out the rate limit, bail immediately instead of
        // making one more upstream call and burning tokens.
        await new Promise<void>((resolve, reject) => {
          if (abortSignal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          const t = setTimeout(resolve, 2000);
          abortSignal?.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
        pass = await streamingRequest(personaId, modelId, messages, tools, onChunk, ignore, temperature);
      } else {
        throw err;
      }
    }

    if (pass.type === 'final') return;

    // Model asked for tools — run them and feed results back
    if (process.env.DEBUG_OPENROUTER) {
      console.debug('[openrouter-client] tool_calls parsed:', pass.calls.map((c) => `${c.name}(${c.arguments.slice(0, 80)})`));
    }

    // Append the assistant turn that made the tool calls
    messages.push({
      role: 'assistant',
      content: pass.assistantContent || null,
      tool_calls: pass.calls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.arguments },
      })),
    });

    // Execute each call in order and append its result
    for (const call of pass.calls) {
      const result = await evaluateAndExecute(call, persona);
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }
    // loop — ask OpenRouter again with the tool results in context
  }

  // Safety: we hit the round cap
  const stopMsg = '\n\n[Stopped: tool-call loop exceeded maximum rounds]';
  onChunk(stopMsg, true);
}
