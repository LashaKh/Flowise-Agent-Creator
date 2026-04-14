/**
 * OpenClaw Manager
 *
 * Manages the OpenClaw gateway lifecycle. OpenClaw is bundled inside the app
 * (as a dependency in node_modules), so there's nothing to download at runtime.
 *
 * The gateway runs using Electron's own Node.js via ELECTRON_RUN_AS_NODE,
 * which works identically on macOS, Windows, and Linux.
 */
import { spawn, ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { app } from 'electron';

// ─── Constants ──────────────────────────────────────

const GATEWAY_PORT = 18789;
// Random gateway token generated per app launch. The old hardcoded
// `personahub-local` token let any local process talk to the gateway's
// file-write/exec tools (audit finding P2-6). We generate a fresh secret
// at process start and write it into ~/.openclaw/openclaw.json so the
// gateway and client agree.
export const GATEWAY_TOKEN = crypto.randomBytes(32).toString('hex');
const OPENCLAW_CONFIG_DIR = path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_CONFIG_DIR, 'openclaw.json');

// ─── Module State ───────────────────────────────────

let gatewayProcess: ChildProcess | null = null;
let installedCache: boolean | null = null;

// ─── Path Helper ────────────────────────────────────

/**
 * Get the path to openclaw's entry script inside the app bundle.
 *
 * In dev mode: node_modules/openclaw/openclaw.mjs (relative to project root)
 * In production: the asar.unpacked copy so it can be spawned as a process
 */
export function getOpenClawEntryPath(): string {
  const appPath = app.getAppPath();
  const base = app.isPackaged
    ? appPath.replace('app.asar', 'app.asar.unpacked')
    : appPath;
  return path.join(base, 'node_modules', 'openclaw', 'openclaw.mjs');
}

// ─── Public API ─────────────────────────────────────

/**
 * Check if OpenClaw is ready to run:
 * - The bundled entry script exists
 * - The config file parses AND contains at least one provider with a non-empty apiKey
 *
 * The apiKey check prevents the "file exists but was emptied out" edge case
 * from silently skipping the wizard and letting the gateway fail later.
 */
export async function checkInstallation(): Promise<boolean> {
  const binaryExists = fs.existsSync(getOpenClawEntryPath());
  if (!binaryExists) {
    installedCache = false;
    return false;
  }
  installedCache = getConfiguredProvider() !== null;
  return installedCache;
}

/**
 * Return the provider whose apiKey is configured, or null if none.
 * Used by the renderer to show "we detected your existing key" messaging.
 */
export function getConfiguredProvider(): 'anthropic' | 'google' | null {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return null;
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    const providers = config?.models?.providers ?? {};
    if (typeof providers.anthropic?.apiKey === 'string' && providers.anthropic.apiKey.trim()) {
      return 'anthropic';
    }
    if (typeof providers.google?.apiKey === 'string' && providers.google.apiKey.trim()) {
      return 'google';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Return a masked preview of the configured key (e.g. "AIza••••3Ls")
 * so the UI can confirm detection without revealing the full secret.
 */
export function getConfiguredKeyPreview(): string | null {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return null;
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    const provider = getConfiguredProvider();
    if (!provider) return null;
    const key: string = config?.models?.providers?.[provider]?.apiKey ?? '';
    if (key.length < 8) return null;
    return `${key.slice(0, 4)}••••${key.slice(-3)}`;
  } catch {
    return null;
  }
}

/**
 * If the config is missing/invalid but an API key is present in the environment
 * (ANTHROPIC_API_KEY or GEMINI_API_KEY/GOOGLE_API_KEY), write a config for it
 * and return true. Lets users who already have keys in their shell skip the wizard.
 */
export function tryAutoBootstrapFromEnv(): boolean {
  if (getConfiguredProvider() !== null) return true;
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  const google = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (anthropic) {
    writeConfig(anthropic, 'anthropic');
    console.log('[openclaw] auto-bootstrapped from ANTHROPIC_API_KEY env');
    installedCache = true;
    return true;
  }
  if (google) {
    writeConfig(google, 'google');
    console.log('[openclaw] auto-bootstrapped from GEMINI_API_KEY env');
    installedCache = true;
    return true;
  }
  return false;
}

/**
 * Write the OpenClaw configuration file (~/.openclaw/openclaw.json).
 * Sets up the API key, model provider, and gateway settings.
 */
export function writeConfig(
  apiKey: string,
  provider: 'anthropic' | 'google'
): void {
  fs.mkdirSync(OPENCLAW_CONFIG_DIR, { recursive: true });

  const modelId =
    provider === 'google' ? 'gemini-2.5-flash' : 'claude-sonnet-4-5';

  const baseUrl =
    provider === 'google'
      ? 'https://generativelanguage.googleapis.com/v1beta'
      : 'https://api.anthropic.com';

  const config = {
    models: {
      providers: {
        [provider]: {
          apiKey,
          baseUrl,
          models: [{ id: modelId, name: modelId }],
        },
      },
    },
    gateway: {
      port: GATEWAY_PORT,
      bind: 'loopback',
      mode: 'local',
      auth: { token: GATEWAY_TOKEN },
      http: {
        endpoints: {
          chatCompletions: { enabled: true },
        },
      },
    },
    agents: {
      defaults: { model: { primary: `${provider}/${modelId}` } },
      list: [],
    },
  };

  fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Patch the gateway auth token in the existing config file.
 * Called on auto-start so the gateway and app agree on the token
 * (GATEWAY_TOKEN is regenerated every launch for security).
 */
export function refreshConfigToken(): void {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    if (!config.gateway) config.gateway = {};
    if (!config.gateway.auth) config.gateway.auth = {};
    config.gateway.auth.token = GATEWAY_TOKEN;
    fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[openclaw] Failed to refresh config token:', err);
  }
}

/**
 * Start the OpenClaw gateway process.
 *
 * Uses Electron's own Node.js (process.execPath) with ELECTRON_RUN_AS_NODE=1
 * to run the bundled openclaw entry script. This works on all platforms
 * without any platform-specific branching.
 */
export async function startGateway(): Promise<void> {
  if (gatewayProcess) {
    return; // Already running
  }

  const entryPath = getOpenClawEntryPath();

  if (!fs.existsSync(entryPath)) {
    throw new Error(`OpenClaw entry script not found at ${entryPath}`);
  }

  console.log(`[openclaw] starting gateway: ${process.execPath} ${entryPath} gateway --port ${GATEWAY_PORT}`);

  gatewayProcess = spawn(
    process.execPath,
    [entryPath, 'gateway', '--port', String(GATEWAY_PORT)],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    }
  );

  gatewayProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[openclaw:stdout] ${data.toString().trim()}`);
  });

  gatewayProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[openclaw:stderr] ${data.toString().trim()}`);
  });

  gatewayProcess.on('error', (err) => {
    console.error('[openclaw] gateway spawn error:', err.message);
    gatewayProcess = null;
  });

  gatewayProcess.on('exit', (code) => {
    console.log(`[openclaw] gateway exited with code ${code}`);
    gatewayProcess = null;
  });

  // Clean up gateway when the main process exits
  const cleanup = () => {
    stopGateway();
  };
  process.once('exit', cleanup);
  if (process.platform !== 'win32') {
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }
}

/**
 * Wait for the gateway to become responsive by polling its health endpoint.
 * Returns true if the gateway responds within the timeout, false otherwise.
 */
export function waitForReady(timeoutMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    function poll() {
      if (Date.now() - startTime > timeoutMs) {
        resolve(false);
        return;
      }

      const req = http.get(`http://127.0.0.1:${GATEWAY_PORT}/`, (res) => {
        // Any response means the server is up
        res.resume(); // Drain the response
        resolve(true);
      });

      req.on('error', () => {
        // Not ready yet — try again in 500ms
        setTimeout(poll, 500);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(poll, 500);
      });
    }

    poll();
  });
}

/**
 * Stop the OpenClaw gateway process.
 */
export function stopGateway(): void {
  if (!gatewayProcess) return;

  try {
    if (process.platform === 'win32') {
      gatewayProcess.kill();          // TerminateProcess on Windows
    } else {
      gatewayProcess.kill('SIGTERM'); // graceful on Unix
    }
  } catch {
    // Process may have already exited
  }

  gatewayProcess = null;
}

/**
 * Get the current state of the OpenClaw runtime.
 */
export function getState(): { installed: boolean; running: boolean; port: number } {
  return {
    installed: installedCache ?? false,
    running: gatewayProcess !== null && !gatewayProcess.killed,
    port: GATEWAY_PORT,
  };
}

export function getGatewayToken(): string {
  return GATEWAY_TOKEN;
}

/**
 * Read the configured model string (e.g. "google/gemini-2.5-flash") from the config file.
 * Falls back to google/gemini-2.5-flash if the config can't be read.
 */
export function getConfiguredModel(): string {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    return config?.agents?.defaults?.model?.primary ?? 'google/gemini-2.5-flash';
  } catch {
    return 'google/gemini-2.5-flash';
  }
}

/**
 * Read the provider name and API key from the config file.
 * Used for direct API calls (e.g. speech-to-text) that bypass the gateway.
 */
export function getProviderConfig(): { provider: 'google' | 'anthropic'; apiKey: string } | null {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    const providers = config?.models?.providers;
    if (!providers) return null;

    for (const name of ['google', 'anthropic'] as const) {
      if (providers[name]?.apiKey) {
        return { provider: name, apiKey: providers[name].apiKey };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clean up old runtime downloads from ~/.personahub/runtime/.
 * Previous versions downloaded Node.js + openclaw there; now it's bundled.
 */
export function cleanupOldRuntime(): void {
  const oldRuntime = path.join(os.homedir(), '.personahub', 'runtime');
  if (fs.existsSync(oldRuntime)) {
    try {
      fs.rmSync(oldRuntime, { recursive: true, force: true });
      console.log('[openclaw] Cleaned up old runtime directory:', oldRuntime);
    } catch (err) {
      console.warn('[openclaw] Failed to clean up old runtime:', err);
    }
  }
}
