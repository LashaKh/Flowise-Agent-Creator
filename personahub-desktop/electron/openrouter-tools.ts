/**
 * OpenRouter Tool Executors
 *
 * When an OpenRouter model emits a tool_call, this module actually performs
 * the action (read a file, fetch a URL, etc.) and returns the result as a
 * string or JSON — which gets fed back to the model in the next round.
 *
 * IMPORTANT: These executors assume the ActionGuard has ALREADY approved the
 * call. Never invoke them without running `evaluateAction` first — path
 * validation lives in the guard, not here.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

const MAX_FILE_BYTES = 1_000_000;   // 1 MB read cap
const MAX_FETCH_BYTES = 100_000;    // 100 KB URL fetch cap
const MAX_LIST_ENTRIES = 200;       // don't dump a 10k-file directory

function expandHome(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function httpsGetText(urlStr: string, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlStr);
    } catch {
      reject(new Error(`Invalid URL: ${urlStr}`));
      return;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      reject(new Error(`Unsupported protocol: ${url.protocol}`));
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, { timeout: 15000, headers: { 'User-Agent': 'PersonaHub/1.0' } }, (res) => {
      // Follow redirects (one hop only)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        httpsGetText(new URL(res.headers.location, url).toString(), maxBytes).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`));
        return;
      }
      let received = 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          req.destroy();
          resolve(Buffer.concat(chunks).toString('utf-8').slice(0, maxBytes) + '\n\n[truncated]');
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// Quick-and-dirty HTML → text. Not perfect, but gives the model something
// readable instead of raw <div><span class="...">… markup.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// DuckDuckGo Instant Answer API — free, keyless, returns JSON.
// Best for factual/informational queries ("weather in X", "who is Y").
// For general web search OpenRouter's :online plugin gives much better
// results, but this is a safe default when the model explicitly calls the tool.
async function duckDuckGo(query: string): Promise<unknown> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
  const raw = await httpsGetText(url, MAX_FETCH_BYTES);
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    // Return the bits actually useful to the model — the full DDG response
    // is mostly empty fields.
    return {
      abstract: json.Abstract || null,
      abstractSource: json.AbstractSource || null,
      abstractUrl: json.AbstractURL || null,
      answer: json.Answer || null,
      answerType: json.AnswerType || null,
      definition: json.Definition || null,
      relatedTopics: Array.isArray(json.RelatedTopics)
        ? (json.RelatedTopics as Array<Record<string, unknown>>)
            .slice(0, 5)
            .map((t) => ({ text: t.Text, url: t.FirstURL }))
            .filter((t) => t.text)
        : [],
      note: !json.Abstract && !json.Answer
        ? 'DuckDuckGo Instant Answer returned no direct abstract. For richer web search, consider enabling OpenRouter\'s :online plugin on your model.'
        : undefined,
    };
  } catch {
    return { raw: raw.slice(0, 2000) };
  }
}

/**
 * Map the OpenAI-style function name the model sees to the tool-id used
 * by ActionGuard / permission memory / the Activity Log.
 */
export function mapFunctionNameToToolId(name: string): string {
  switch (name) {
    case 'read_file':      return 'read';
    case 'list_directory': return 'ls';
    case 'write_file':     return 'write';
    case 'edit_file':      return 'edit';
    case 'run_command':    return 'exec';
    case 'web_search':     return 'web_search';
    case 'web_fetch':      return 'web_fetch';
    default:               return name;
  }
}

/** Extract the best `target` path/URL for ActionGuard's validator. */
export function extractTarget(_name: string, args: Record<string, unknown>): string | undefined {
  if (typeof args.path === 'string') return args.path;
  if (typeof args.url === 'string') return args.url;
  if (typeof args.query === 'string') return args.query;
  return undefined;
}

export function safeParseArgs(argsStr: string | undefined): Record<string, unknown> {
  if (!argsStr) return {};
  try {
    const parsed = JSON.parse(argsStr);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * Run a single tool. Caller must have already approved it through ActionGuard.
 * Returns either a string (file contents, fetched HTML) or a JSON object.
 * Throws on execution errors — the caller turns those into `{error: msg}`
 * objects and feeds them back to the model.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'read_file': {
      const rawPath = typeof args.path === 'string' ? args.path : '';
      if (!rawPath) throw new Error('Missing required argument: path');
      const full = expandHome(rawPath);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) throw new Error(`Path is a directory, not a file: ${rawPath}`);
      if (stat.size > MAX_FILE_BYTES) throw new Error(`File too large (${stat.size} bytes, max ${MAX_FILE_BYTES})`);
      return fs.readFileSync(full, 'utf-8');
    }

    case 'list_directory': {
      const rawPath = typeof args.path === 'string' ? args.path : '';
      if (!rawPath) throw new Error('Missing required argument: path');
      const full = expandHome(rawPath);
      const entries = fs.readdirSync(full, { withFileTypes: true });
      return {
        path: full,
        entries: entries.slice(0, MAX_LIST_ENTRIES).map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other',
        })),
        truncated: entries.length > MAX_LIST_ENTRIES ? entries.length - MAX_LIST_ENTRIES : 0,
      };
    }

    case 'write_file': {
      const rawPath = typeof args.path === 'string' ? args.path : '';
      const content = typeof args.content === 'string' ? args.content : '';
      if (!rawPath) throw new Error('Missing required argument: path');
      const full = expandHome(rawPath);
      const dir = path.dirname(full);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(full, content);
      return { ok: true, path: full, bytes: Buffer.byteLength(content) };
    }

    case 'edit_file': {
      const rawPath = typeof args.path === 'string' ? args.path : '';
      const oldStr = typeof args.old_string === 'string' ? args.old_string : '';
      const newStr = typeof args.new_string === 'string' ? args.new_string : '';
      if (!rawPath || !oldStr) throw new Error('Missing required arguments: path and old_string');
      const full = expandHome(rawPath);
      const src = fs.readFileSync(full, 'utf-8');
      if (!src.includes(oldStr)) throw new Error('old_string not found in file');
      if (src.split(oldStr).length > 2) throw new Error('old_string matches multiple places — make it more specific');
      fs.writeFileSync(full, src.replace(oldStr, newStr));
      return { ok: true, path: full };
    }

    case 'web_fetch': {
      const url = typeof args.url === 'string' ? args.url : '';
      if (!url) throw new Error('Missing required argument: url');
      const body = await httpsGetText(url, MAX_FETCH_BYTES);
      // Looks like HTML? strip tags for the model
      if (body.trim().startsWith('<')) return { url, text: htmlToText(body).slice(0, 20_000) };
      return { url, text: body };
    }

    case 'web_search': {
      const query = typeof args.query === 'string' ? args.query : '';
      if (!query) throw new Error('Missing required argument: query');
      return await duckDuckGo(query);
    }

    case 'run_command': {
      throw new Error('run_command is not yet implemented (dangerous tool)');
    }

    default:
      throw new Error(`Tool not implemented: ${name}`);
  }
}
