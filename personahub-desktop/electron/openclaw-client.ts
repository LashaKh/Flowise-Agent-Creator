import WebSocket from 'ws';

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'http://127.0.0.1:18789';
const WS_URL = 'ws://127.0.0.1:18789';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let wsConnection: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 10000;

// ---------------------------------------------------------------------------
// HTTP Streaming — sendMessage
// ---------------------------------------------------------------------------

export async function sendMessage(
  agentId: string,
  message: string,
  sessionKey: string,
  onChunk: (content: string, done: boolean) => void,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-openclaw-session-key': sessionKey,
    },
    body: JSON.stringify({
      model: 'openclaw:' + agentId,
      messages: [{ role: 'user', content: message }],
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenClaw request failed (${response.status}): ${await response.text()}`,
    );
  }

  const body = response.body;
  if (!body) {
    throw new Error('OpenClaw response has no body');
  }

  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const parts = buffer.split('\n\n');
      // Keep the last (potentially incomplete) part in the buffer
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Each SSE event line starts with "data: "
        for (const line of trimmed.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6); // strip "data: "

          if (payload === '[DONE]') {
            onChunk(accumulated, true);
            return;
          }

          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              accumulated += delta;
              onChunk(accumulated, false);
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }

    // Stream ended without [DONE] — still signal completion
    onChunk(accumulated, true);
  } finally {
    reader.releaseLock();
  }
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
    reconnectDelay = 1000; // reset backoff on successful connect
    ws.send(
      JSON.stringify({
        type: 'req',
        method: 'connect',
        params: { role: 'operator', scopes: ['operator.approvals'] },
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
    // close will fire after error — reconnect handled there
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
  if (reconnectTimer) return; // already scheduled

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
