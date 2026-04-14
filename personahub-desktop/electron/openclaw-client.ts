import WebSocket from 'ws';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { getConfiguredModel, getProviderConfig, GATEWAY_TOKEN } from './openclaw-manager';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalRequest {
  requestId: string;
  agentId?: string;
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
// GATEWAY_TOKEN is imported from openclaw-manager (random per launch).
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
        // Guard against double-done: if `[DONE]` arrives AND the stream then
        // closes normally, both handlers would fire `onChunk(..., true)` and
        // the renderer would persist an empty phantom row. Audit finding P2-1.
        let resolved = false;
        const finish = () => {
          if (resolved) return;
          resolved = true;
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
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);

              if (data === '[DONE]') {
                finish();
                return;
              }

              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  accumulated += delta;
                  onChunk(delta, false);
                }
              } catch (err) {
                // Surface parse failures instead of silently dropping them
                // (audit finding M3). This helps debug gateway format drifts.
                console.warn('[openclaw-client] SSE parse error:', (err as Error).message, data.slice(0, 200));
              }
            }
          }
        });

        res.on('end', finish);
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
  // Gateway expects "openclaw" as the model — it routes to the actual AI
  // model (gemini/claude) based on the config file internally.
  const model = modelOverride || 'openclaw';
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
          agentId: params.agentId,
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
    model: 'openclaw',
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
// generateSpeech — cloud TTS via OpenClaw gateway (returns binary audio)
// ---------------------------------------------------------------------------

export async function generateSpeech(
  text: string,
  voiceId: string,
  provider: string,
): Promise<{ audioBuffer: ArrayBuffer; durationMs: number }> {
  const payload = JSON.stringify({
    model: `tts-1`,
    input: text,
    voice: voiceId,
    provider,
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: GATEWAY_PORT,
        path: '/v1/audio/speech',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        // Collect as raw buffers — do NOT set encoding (binary data!)
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            const errorBody = Buffer.concat(chunks).toString('utf-8');
            reject(new Error(`TTS failed (${res.statusCode}): ${errorBody}`));
            return;
          }
          const buffer = Buffer.concat(chunks);
          // Estimate duration from audio size (rough: MP3 ~128kbps = 16KB/s)
          const durationMs = Math.round((buffer.length / 16000) * 1000);
          resolve({
            audioBuffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            durationMs,
          });
        });
      },
    );

    req.on('error', (err) => {
      reject(new Error(`Gateway connection failed: ${err.message}`));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('TTS request timed out'));
    });

    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// transcribeAudio — STT via direct provider API call
// Calls Gemini or Anthropic directly (the gateway doesn't have a transcription
// endpoint). Uses the same API key from ~/.openclaw/openclaw.json.
// ---------------------------------------------------------------------------

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const config = getProviderConfig();
  if (!config) throw new Error('No AI provider configured — complete setup first');

  const base64Audio = audioBuffer.toString('base64');
  const prompt = 'Transcribe the following audio exactly as spoken. Output ONLY the transcribed text, nothing else — no quotes, no labels, no explanation.';

  if (config.provider === 'google') {
    return transcribeViaGemini(config.apiKey, base64Audio, mimeType, prompt);
  } else {
    return transcribeViaAnthropic(config.apiKey, base64Audio, mimeType, prompt);
  }
}

function transcribeViaGemini(apiKey: string, base64Audio: string, mimeType: string, prompt: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Audio } },
      ],
    }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Gemini transcription failed (${res.statusCode}): ${responseBody.slice(0, 200)}`));
            return;
          }
          try {
            const json = JSON.parse(responseBody);
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve(text.trim());
          } catch {
            reject(new Error('Failed to parse Gemini response'));
          }
        });
      },
    );

    req.on('error', (err) => reject(new Error(`Gemini API error: ${err.message}`)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Transcription timed out')); });
    req.write(body);
    req.end();
  });
}

function transcribeViaAnthropic(apiKey: string, base64Audio: string, mimeType: string, prompt: string): Promise<string> {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'audio', source: { type: 'base64', media_type: mimeType, data: base64Audio } },
      ],
    }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Anthropic transcription failed (${res.statusCode}): ${responseBody.slice(0, 200)}`));
            return;
          }
          try {
            const json = JSON.parse(responseBody);
            const text = json?.content?.[0]?.text || '';
            resolve(text.trim());
          } catch {
            reject(new Error('Failed to parse Anthropic response'));
          }
        });
      },
    );

    req.on('error', (err) => reject(new Error(`Anthropic API error: ${err.message}`)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Transcription timed out')); });
    req.write(body);
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
