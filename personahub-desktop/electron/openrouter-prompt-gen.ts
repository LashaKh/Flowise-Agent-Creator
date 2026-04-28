/**
 * OpenRouter prompt generator — produces a rich persona system prompt
 * from a (name, description) pair using OpenRouter's chat-completions API
 * directly. This is the OpenRouter-native counterpart to
 * openclaw-client.ts's `generatePrompt` and is used when the openclaw
 * gateway isn't running (the default in v0.3.6+ where the bundled
 * OpenRouter key powers chat).
 *
 * Non-streaming. One HTTP POST, parse choices[0].message.content, return.
 * Reuses the same 5-section prompt template that openclaw-client uses so
 * the output style is consistent across both backends.
 */
import https from 'node:https';
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_APP_NAME,
  OPENROUTER_APP_URL,
  getOpenRouterApiKey,
} from './openrouter-config';

// Cheapest + fastest OpenRouter model that handles 1k-token completions
// well. ~$0.0003 per persona prompt at typical lengths.
const PROMPT_GEN_MODEL = 'deepseek/deepseek-v3.2';
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Generate a rich persona system prompt via OpenRouter.
 *
 * Throws on auth failure, network error, HTTP 4xx/5xx, empty completion.
 * Caller should catch and either fall back to a placeholder template or
 * surface the error to the UI.
 */
export async function openrouterGeneratePrompt(
  name: string,
  description: string,
): Promise<string> {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('No OpenRouter API key available (neither bundled nor user-provided).');
  }

  // Same template as openclaw-client.ts:428-440 so the output style stays
  // identical across backends. Keep them in sync if either is edited.
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
    model: PROMPT_GEN_MODEL,
    messages: [{ role: 'user', content: metaPrompt }],
    stream: false,
    temperature: 0.7,
  });

  const url = new URL('/api/v1/chat/completions', OPENROUTER_BASE_URL);

  return new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
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
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Failed to generate prompt: HTTP ${res.statusCode} — ${body.slice(0, 200)}`));
            return;
          }
          try {
            const json = JSON.parse(body);
            const content: unknown = json?.choices?.[0]?.message?.content;
            if (typeof content !== 'string' || !content.trim()) {
              reject(new Error('Failed to generate prompt: empty completion from OpenRouter.'));
              return;
            }
            resolve(content.trim());
          } catch (err) {
            reject(new Error(`Failed to generate prompt: parse error — ${err instanceof Error ? err.message : String(err)}`));
          }
        });
      },
    );

    req.on('error', (err) => {
      reject(new Error(`Failed to generate prompt: network error — ${err.message}`));
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Failed to generate prompt: timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`));
    });

    req.write(payload);
    req.end();
  });
}
