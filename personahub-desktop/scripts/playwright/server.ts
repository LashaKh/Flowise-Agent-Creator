/**
 * Playwright server for PersonaHub E2E QA.
 *
 * Keeps ONE Electron app instance warm across all agent invocations of
 * `cmd.ts`. Agents POST JSON commands to http://localhost:7755; this
 * server translates them into Playwright calls on the live Electron
 * window and returns the result.
 *
 * Named contexts: each `?context=agentNN` gets its own BrowserContext so
 * Wave 2 agents can work in parallel without stepping on each other. In
 * practice, Electron has ONE BrowserWindow — for now we route every
 * context to the same window. True isolation would require launching
 * multiple Electron apps; out of scope for v1.
 *
 * Usage:
 *   pnpm qa:server                 # starts server, launches Electron
 *   curl -X POST http://localhost:7755/navigate -d '{"url":"http://localhost:5173"}'
 *   curl -X POST http://localhost:7755/stop     # shuts down
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, ElectronApplication, Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.QA_PORT ?? 7755);
const ROOT = path.resolve(__dirname, '..', '..');

interface ContextState {
  page: Page;
}

let electronApp: ElectronApplication | null = null;
const contexts = new Map<string, ContextState>();

async function ensureApp(): Promise<ElectronApplication> {
  if (electronApp) return electronApp;
  console.log('[qa-server] Launching Electron with PERSONAHUB_E2E=1...');
  electronApp = await electron.launch({
    args: [ROOT],
    env: {
      ...process.env,
      PERSONAHUB_E2E: '1',
      NODE_ENV: 'test',
      ELECTRON_ENABLE_LOGGING: '1',
    },
    timeout: 60_000,
  });
  const firstWindow = await electronApp.firstWindow({ timeout: 30_000 });
  await firstWindow.waitForLoadState('domcontentloaded');
  console.log('[qa-server] Electron ready.');
  return electronApp;
}

async function getPage(contextName: string): Promise<Page> {
  const existing = contexts.get(contextName);
  if (existing) return existing.page;
  const app = await ensureApp();
  // Reuse the first window for all contexts. Multi-window is a future enhancement.
  const page = await app.firstWindow();
  contexts.set(contextName, { page });
  return page;
}

async function handleCommand(
  verb: string,
  body: Record<string, unknown>,
  contextName: string
): Promise<unknown> {
  const page = await getPage(contextName);
  switch (verb) {
    case 'navigate':
      await page.goto(String(body.url), { waitUntil: 'domcontentloaded' });
      return { url: page.url() };
    case 'url':
      return { url: page.url() };
    case 'fill':
      await page.fill(String(body.selector), String(body.value));
      return { ok: true };
    case 'click':
      await page.click(String(body.selector), { timeout: 10_000 });
      return { ok: true };
    case 'screenshot': {
      const name = String(body.name ?? 'screenshot');
      const screenshotPath = path.join(ROOT, '..', 'screenshots', `${name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return { path: screenshotPath };
    }
    case 'wait': {
      const ms = Number(body.ms ?? 1000);
      await page.waitForTimeout(ms);
      return { ok: true };
    }
    case 'waitfor':
      await page.waitForSelector(String(body.selector), { timeout: 15_000 });
      return { ok: true };
    case 'text': {
      const text = await page.textContent(String(body.selector));
      return { text };
    }
    case 'evaluate': {
      const result = await page.evaluate(String(body.script));
      return { result };
    }
    case 'viewport': {
      await page.setViewportSize({
        width: Number(body.width),
        height: Number(body.height),
      });
      return { ok: true };
    }
    case 'select':
    case 'selectOption':
      await page.selectOption(String(body.selector), String(body.value));
      return { ok: true };
    case 'press':
      await page.keyboard.press(String(body.key));
      return { ok: true };
    case 'count': {
      const count = await page.locator(String(body.selector)).count();
      return { count };
    }
    case 'exists': {
      const count = await page.locator(String(body.selector)).count();
      return { exists: count > 0 };
    }
    case 'html': {
      const html = await page.innerHTML(String(body.selector));
      return { html };
    }
    case 'clear':
      await page.fill(String(body.selector), '');
      return { ok: true };
    case 'health':
      return { status: 'ok', electron: electronApp !== null, contexts: contexts.size };
    case 'stop':
      // handled at request level
      throw new Error('stop should be handled before dispatch');
    default:
      throw new Error(`Unknown verb: ${verb}`);
  }
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const verb = url.pathname.slice(1) || 'health';
    const contextName = url.searchParams.get('context') ?? 'default';

    if (verb === 'stop') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, stopping: true }));
      console.log('[qa-server] Stop requested — closing Electron...');
      if (electronApp) {
        await electronApp.close().catch(() => void 0);
        electronApp = null;
      }
      setTimeout(() => process.exit(0), 200);
      return;
    }

    try {
      const payload = body ? JSON.parse(body) : {};
      const result = await handleCommand(verb, payload, contextName);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[qa-server] ${verb} failed:`, message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[qa-server] Listening on http://localhost:${PORT}`);
  // Pre-warm Electron so the first real command is fast.
  ensureApp().catch((err) => {
    console.error('[qa-server] Pre-warm failed:', err);
    process.exit(1);
  });
});

process.on('SIGINT', async () => {
  if (electronApp) await electronApp.close().catch(() => void 0);
  process.exit(0);
});
