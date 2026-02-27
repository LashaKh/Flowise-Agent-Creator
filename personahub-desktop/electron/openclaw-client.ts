import WebSocket from 'ws';
import http from 'node:http';
import os from 'node:os';
import { getConfiguredModel } from './openclaw-manager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalRequest {
  requestId: string;
  tool: string;
  action: string;
  target?: string;
  content?: string;
}

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GATEWAY_PORT = 18789;
const WS_URL = 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = 'personahub-local';
// ---------------------------------------------------------------------------
// Tool definitions (OpenAI function-calling format)
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
      description: 'Search the web for information (not available in local mode)',
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
      description: 'Fetch and return the text content of a URL (not available in local mode)',
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

// (Tool execution is handled server-side by the OpenClaw gateway)

function buildToolDefs(enabledTools: string[]): ToolDef[] {
  const defs: ToolDef[] = [];
  for (const t of enabledTools) {
    if (ALL_TOOLS[t]) defs.push(ALL_TOOLS[t]);
  }
  return defs;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let wsConnection: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 10000;

// ---------------------------------------------------------------------------
// Streaming request
// ---------------------------------------------------------------------------

function streamingRequest(
  agentId: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  sessionKey: string,
  onChunk: (content: string, done: boolean) => void,
): Promise<void> {
  const body: Record<string, unknown> = { model, messages, stream: true };
  if (tools.length > 0) body.tools = tools;
  const payload = JSON.stringify(body);

  return new Promise<void>((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: GATEWAY_PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
          'x-openclaw-session-key': sessionKey,
          'x-openclaw-agent-id': agentId,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let errBody = '';
          res.on('data', (chunk: Buffer) => { errBody += chunk.toString(); });
          res.on('end', () => {
            reject(new Error(`OpenClaw request failed (${res.statusCode}): ${errBody}`));
          });
          return;
        }

        let buffer = '';
        let accumulated = '';

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
                onChunk(accumulated, true);
                resolve();
                return;
              }

              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulated += delta;
                  onChunk(delta, false);
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        });

        res.on('end', () => {
          onChunk(accumulated, true);
          resolve();
        });
      },
    );

    req.on('error', (err) => {
      reject(new Error(`Gateway connection failed: ${err.message}`));
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Gateway request timed out'));
    });

    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// sendMessage — main entry point
// The OpenClaw gateway runs its own agent loop with native tools when
// tools are passed. We just stream and get back the final text.
// ---------------------------------------------------------------------------

export async function sendMessage(
  agentId: string,
  message: string,
  sessionKey: string,
  onChunk: (content: string, done: boolean) => void,
  systemPrompt?: string,
  modelOverride?: string,
  enabledTools?: string[],
): Promise<void> {
  const model = modelOverride || getConfiguredModel();
  const tools = enabledTools?.length ? buildToolDefs(enabledTools) : [];

  // Environment context so the AI knows where it is
  const platformName = process.platform === 'darwin' ? 'macOS'
    : process.platform === 'win32' ? 'Windows'
    : 'Linux';
  const envInfo = `\nEnvironment: ${platformName}, home directory: ${os.homedir()}, user: ${os.userInfo().username}`;

  // Embed system prompt in the user message (gateway strips role:'system')
  const userContent = systemPrompt
    ? `[System Instructions — follow these at all times]\n${systemPrompt}${envInfo}\n\nIMPORTANT: When the user asks you to perform file operations (read, list, write, create), you MUST call your tools to do it. Do NOT just describe what you would do — actually execute the tool.\n[End of System Instructions]\n\nUser: ${message}`
    : `[Environment: ${platformName}, home: ${os.homedir()}, user: ${os.userInfo().username}]\n\n${message}`;

  const messages: ChatMessage[] = [
    { role: 'user', content: userContent },
  ];

  console.log('[openclaw-client] sendMessage:', {
    agentId,
    model,
    toolCount: tools.length,
    toolNames: tools.map((t) => t.function.name),
  });

  // Stream request — gateway handles tool execution internally
  return streamingRequest(agentId, model, messages, tools, sessionKey, onChunk);
}

// ---------------------------------------------------------------------------
// WebSocket — approval channel
// ---------------------------------------------------------------------------

export function connectApprovalWebSocket(
  onRequest: (request: ApprovalRequest) => void,
): void {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    return; // already connected
  }

  const ws = new WebSocket(WS_URL);
  wsConnection = ws;

  ws.on('open', () => {
    reconnectDelay = 1000;
    ws.send(
      JSON.stringify({
        type: 'req',
        method: 'connect',
        params: {
          role: 'operator',
          scopes: ['operator.approvals'],
          auth: { token: GATEWAY_TOKEN },
        },
      }),
    );
  });

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg?.method === 'exec.approval.requested' || msg?.type === 'exec.approval.requested') {
        const params = msg.params ?? msg.data ?? msg;
        onRequest({
          requestId: params.requestId,
          tool: params.tool,
          action: params.action,
          target: params.target,
          content: params.content,
        });
      }
    } catch {
      // Ignore unparseable messages
    }
  });

  ws.on('close', () => {
    wsConnection = null;
    scheduleReconnect(onRequest);
  });

  ws.on('error', () => {
    try {
      ws.close();
    } catch {
      // already closed
    }
  });
}

function scheduleReconnect(
  onRequest: (request: ApprovalRequest) => void,
): void {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connectApprovalWebSocket(onRequest);
  }, reconnectDelay);
}

// ---------------------------------------------------------------------------
// resolveApproval
// ---------------------------------------------------------------------------

export function resolveApproval(requestId: string, approved: boolean): void {
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    console.warn('Cannot resolve approval — WebSocket not connected');
    return;
  }

  wsConnection.send(
    JSON.stringify({
      type: 'req',
      method: 'exec.approval.resolve',
      params: { requestId, decision: approved ? 'approve' : 'deny' },
    }),
  );
}

// ---------------------------------------------------------------------------
// generatePrompt — asks the AI to create a rich persona system prompt
// ---------------------------------------------------------------------------

export async function generatePrompt(
  name: string,
  description: string,
): Promise<string> {
  const metaPrompt = `You are a persona design specialist. Create a rich system prompt (300-500 words) for an AI persona with these details:

Name: ${name}
Description: ${description}

The system prompt should include:
1. **Identity & Style** — Who they are, their tone, personality traits
2. **Communication Style** — How they speak, vocabulary level, use of analogies
3. **Knowledge & Expertise** — What they know deeply, their specializations
4. **Interaction Guidelines** — How they handle questions, disagreements, off-topic requests
5. **Constraints** — What they should NOT do, boundaries

Write the prompt in second person ("You are..."). Make it vivid and specific — not generic. The persona should feel like a real character with opinions and quirks.`;

  const payload = JSON.stringify({
    model: getConfiguredModel(),
    messages: [{ role: 'user', content: metaPrompt }],
    stream: false,
  });

  return new Promise<string>((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: GATEWAY_PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Prompt generation failed (${res.statusCode}): ${body}`));
            return;
          }
          try {
            const json = JSON.parse(body);
            const content = json.choices?.[0]?.message?.content;
            if (!content) {
              reject(new Error('Empty response from prompt generation'));
              return;
            }
            resolve(content);
          } catch {
            reject(new Error('Failed to parse prompt generation response'));
          }
        });
      },
    );

    req.on('error', (err) => {
      reject(new Error(`Gateway connection failed: ${err.message}`));
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Prompt generation timed out'));
    });

    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (wsConnection) {
    try {
      wsConnection.close();
    } catch {
      // already closed
    }
    wsConnection = null;
  }

  reconnectDelay = 1000;
}
