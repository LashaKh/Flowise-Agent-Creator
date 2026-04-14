/**
 * OpenRouter Streaming Client
 *
 * Talks to https://openrouter.ai/api/v1/chat/completions over HTTPS.
 * Cloned from the OpenClaw client SSE pattern but with three key differences:
 *   1. HTTPS (not local HTTP) → uses `https` module + port 443
 *   2. Bearer auth with the embedded OpenRouter API key (no per-user setup)
 *   3. System prompt as a proper `role: 'system'` message (OpenRouter supports
 *      it natively — better than OpenClaw's user-message embedding hack).
 *
 * Tools are passed in OpenAI function-calling format. NOT all OpenRouter
 * models support tool calling — for the curated 5 models in our catalog,
 * tool support varies. We pass tools when enabledTools is non-empty and
 * trust the model to either use them or ignore them. The renderer-side
 * ActionGuard remains the security backstop.
 */
import https from 'node:https';
import os from 'node:os';
import {
  OPENROUTER_API_KEY,
  OPENROUTER_APP_NAME,
  OPENROUTER_APP_URL,
} from './openrouter-config';
import { appendLlmUsage } from './llm-usage-log';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChatMessage = Record<string, any>;

// Tool catalog identical to openclaw-client.ts so the AI sees the same tools
// regardless of which backend is selected.
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
      description: 'Search the web for information',
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
// Streaming request — SSE parser identical to openclaw-client.ts pattern
// ---------------------------------------------------------------------------

function streamingRequest(
  personaId: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  onChunk: (content: string, done: boolean) => void,
): Promise<void> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    // Ask OpenRouter to include usage stats in the final SSE frame so we can
    // log accurate cost. Without this we'd have to estimate from token counts.
    usage: { include: true },
  };
  if (tools.length > 0) body.tools = tools;
  const payload = JSON.stringify(body);

  return new Promise<void>((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'openrouter.ai',
        port: 443,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
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
            reject(new Error(`OpenRouter request failed (${res.statusCode}): ${errBody.slice(0, 400)}`));
          });
          return;
        }

        let buffer = '';
        let accumulated = '';
        let usageInputTokens = 0;
        let usageOutputTokens = 0;
        let usageCostUsd = 0;

        // Guard against double-done: same audit finding P2-1 from openclaw-client.
        let resolved = false;
        const finish = () => {
          if (resolved) return;
          resolved = true;
          // Log usage to disk for the dashboard
          if (usageInputTokens > 0 || usageOutputTokens > 0 || usageCostUsd > 0) {
            appendLlmUsage({
              personaId,
              model,
              inputTokens: usageInputTokens,
              outputTokens: usageOutputTokens,
              costUsd: usageCostUsd,
            });
          }
          onChunk(accumulated, true);
          resolve();
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
              // OpenRouter sends ': OPENROUTER PROCESSING' comments to keep the
              // connection alive while routing — skip non-data lines.
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);

              if (data === '[DONE]') {
                finish();
                return;
              }

              try {
                const json = JSON.parse(data);

                // Final frame may contain usage stats (because we asked for them)
                if (json.usage) {
                  usageInputTokens = json.usage.prompt_tokens || 0;
                  usageOutputTokens = json.usage.completion_tokens || 0;
                  usageCostUsd = json.usage.cost || 0;
                }

                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulated += delta;
                  onChunk(delta, false);
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
// sendMessage — main entry point (parallel to openclaw-client.sendMessage)
// ---------------------------------------------------------------------------

export async function sendMessage(
  personaId: string,
  message: string,
  onChunk: (content: string, done: boolean) => void,
  systemPrompt: string | undefined,
  modelId: string,
  enabledTools?: string[],
): Promise<void> {
  const tools = enabledTools?.length ? buildToolDefs(enabledTools) : [];

  // Environment context — same info OpenClaw embeds, but we put it inside the
  // system message instead of mangling the user message.
  const platformName = process.platform === 'darwin' ? 'macOS'
    : process.platform === 'win32' ? 'Windows'
    : 'Linux';
  const envInfo = `\n\nEnvironment: ${platformName}, home directory: ${os.homedir()}, user: ${os.userInfo().username}`;

  const messages: ChatMessage[] = [];

  // OpenRouter natively supports `role: 'system'` — much cleaner than the
  // OpenClaw approach of stuffing the system prompt into the user message.
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: `${systemPrompt}${envInfo}\n\nIMPORTANT: When the user asks you to perform file operations (read, list, write, create), you MUST call your tools to do it. Do NOT just describe what you would do — actually execute the tool.`,
    });
  } else {
    messages.push({
      role: 'system',
      content: `You are a helpful AI persona.${envInfo}`,
    });
  }

  messages.push({ role: 'user', content: message });

  console.log('[openrouter-client] sendMessage:', {
    personaId,
    model: modelId,
    toolCount: tools.length,
    toolNames: tools.map((t) => t.function.name),
  });

  return streamingRequest(personaId, modelId, messages, tools, onChunk);
}
