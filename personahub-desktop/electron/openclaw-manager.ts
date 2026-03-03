/**
 * OpenClaw Manager
 *
 * Manages the full OpenClaw lifecycle: downloading Node.js 22, installing
 * the OpenClaw package, writing config, and running the gateway process.
 *
 * Think of this as an "app-within-an-app" installer — it sets up everything
 * OpenClaw needs in ~/.personahub/runtime/ so the AI agents can run locally.
 */
import { execSync, spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import http from 'node:http';

// ─── Constants ──────────────────────────────────────

const NODE_VERSION = '22.22.0';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'personahub-local';
const RUNTIME_DIR = path.join(os.homedir(), '.personahub', 'runtime');
const OPENCLAW_CONFIG_DIR = path.join(os.homedir(), '.openclaw');
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_CONFIG_DIR, 'openclaw.json');

// ─── Module State ───────────────────────────────────

let gatewayProcess: ChildProcess | null = null;
let installedCache: boolean | null = null;

// ─── Platform Helpers ───────────────────────────────

type SupportedPlatform = 'darwin-arm64' | 'darwin-x64' | 'win32-x64' | 'linux-x64';

function getPlatformKey(): SupportedPlatform {
  const plat = process.platform;
  const arch = process.arch;

  if (plat === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (plat === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (plat === 'win32' && arch === 'x64') return 'win32-x64';
  if (plat === 'linux' && arch === 'x64') return 'linux-x64';

  throw new Error(`Unsupported platform: ${plat}-${arch}`);
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Build the Node.js archive download URL for the current platform.
 */
function getNodeDownloadUrl(): string {
  const key = getPlatformKey();

  if (key === 'win32-x64') {
    return `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
  }

  // Map our keys to Node.js naming: darwin-arm64, darwin-x64, linux-x64
  const [plat, arch] = key.split('-') as [string, string];
  return `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${plat}-${arch}.tar.gz`;
}

/**
 * Get the folder name that the Node.js archive extracts to.
 */
function getNodeFolderName(): string {
  const key = getPlatformKey();
  if (key === 'win32-x64') return `node-v${NODE_VERSION}-win-x64`;

  const [plat, arch] = key.split('-') as [string, string];
  return `node-v${NODE_VERSION}-${plat}-${arch}`;
}

/**
 * Get the path to the node binary inside our runtime directory.
 */
function getNodePath(): string {
  const folder = getNodeFolderName();
  if (isWindows()) {
    return path.join(RUNTIME_DIR, folder, 'node.exe');
  }
  return path.join(RUNTIME_DIR, folder, 'bin', 'node');
}

/**
 * Get the path to npm inside our runtime directory.
 */
function getNpmPath(): string {
  const folder = getNodeFolderName();
  if (isWindows()) {
    return path.join(RUNTIME_DIR, folder, 'npm.cmd');
  }
  return path.join(RUNTIME_DIR, folder, 'bin', 'npm');
}

/**
 * Get the npm global bin directory for our runtime's Node.
 */
function getNpmGlobalBin(): string {
  const nodePath = getNodePath();
  const npmPath = getNpmPath();

  try {
    // On Windows, npm.cmd is a batch script — running it through node.exe crashes.
    // Run it directly so cmd.exe handles it natively.
    const cmd = isWindows()
      ? `"${npmPath}" bin -g`
      : `"${nodePath}" "${npmPath}" bin -g`;
    const binDir = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 15000,
    }).trim();
    return binDir;
  } catch {
    // Fallback: typical location relative to node binary
    const folder = getNodeFolderName();
    if (isWindows()) {
      return path.join(RUNTIME_DIR, folder);
    }
    return path.join(RUNTIME_DIR, folder, 'bin');
  }
}

/**
 * Get the path to the openclaw binary.
 */
function getOpenClawBinPath(): string {
  const globalBin = getNpmGlobalBin();
  const binName = isWindows() ? 'openclaw.cmd' : 'openclaw';
  return path.join(globalBin, binName);
}

// Exported for testing
export { getPlatformKey, getNodeDownloadUrl, getNodePath, getNpmPath, getOpenClawBinPath };

// ─── Download Helper ────────────────────────────────

/**
 * Download a file from a URL, following redirects.
 * Reports progress via callback (bytes downloaded / total bytes).
 */
function downloadFile(
  url: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      // Follow redirects (301, 302, 307, 308)
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        downloadFile(response.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;

      const file = fs.createWriteStream(destPath);

      response.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        onProgress(downloadedBytes, totalBytes);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(destPath, () => {}); // Clean up partial file
        reject(err);
      });
    });

    request.on('error', reject);
    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error('Download timed out'));
    });
  });
}

// ─── Public API ─────────────────────────────────────

/**
 * Check if Node.js 22 and OpenClaw are already installed in ~/.personahub/runtime/.
 */
export async function checkInstallation(): Promise<boolean> {
  try {
    const nodePath = getNodePath();
    const openclawPath = getOpenClawBinPath();

    const nodeExists = fs.existsSync(nodePath);
    const openclawExists = fs.existsSync(openclawPath);
    const configExists = fs.existsSync(OPENCLAW_CONFIG_PATH);

    const result = nodeExists && openclawExists && configExists;
    installedCache = result;
    return result;
  } catch {
    installedCache = false;
    return false;
  }
}

/**
 * Download Node.js 22 and install OpenClaw globally.
 *
 * Progress stages:
 *  0-40%  — Downloading Node.js archive
 *  40-80% — Extracting archive and setting up
 *  80-100% — Installing OpenClaw via npm
 */
export async function installRuntime(
  onProgress: (pct: number) => void
): Promise<void> {
  // 1. Create runtime directory
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });

  const nodePath = getNodePath();
  const nodeAlreadyExists = fs.existsSync(nodePath);

  if (nodeAlreadyExists) {
    // Skip download + extract — Node.js is already installed
    console.log('[openclaw] Node.js already exists, skipping download');
    onProgress(80);
  } else {
    const downloadUrl = getNodeDownloadUrl();
    const isZip = downloadUrl.endsWith('.zip');
    const archiveExt = isZip ? '.zip' : '.tar.gz';
    const archivePath = path.join(RUNTIME_DIR, `node${archiveExt}`);

    // 2. Download Node.js archive (0-40%)
    onProgress(0);

    await downloadFile(downloadUrl, archivePath, (downloaded, total) => {
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 40);
        onProgress(pct);
      }
    });

    onProgress(40);

  // 3. Extract archive (40-80%)
  try {
    if (isZip) {
      // Windows: use PowerShell to extract zip
      execSync(
        `powershell -Command "Expand-Archive -Path \\"${archivePath}\\" -DestinationPath \\"${RUNTIME_DIR}\\" -Force"`,
        { timeout: 120000 }
      );
    } else {
      // macOS/Linux: use tar
      execSync(`tar xzf "${archivePath}" -C "${RUNTIME_DIR}"`, {
        timeout: 120000,
      });
    }
    onProgress(70);

    // Clean up the archive file
    fs.unlinkSync(archivePath);
    onProgress(80);
  } catch (err) {
    // Clean up on failure
    try {
      fs.unlinkSync(archivePath);
    } catch {
      // ignore cleanup errors
    }
    throw new Error(`Failed to extract Node.js archive: ${err}`);
  }
  } // end else (nodeAlreadyExists)

  // 4. Install OpenClaw globally via our Node.js (80-100%)
  const openclawBin = getOpenClawBinPath();
  if (fs.existsSync(openclawBin)) {
    console.log('[openclaw] OpenClaw already installed, skipping npm install');
    onProgress(100);
  } else {
    const npmPath = getNpmPath();
    if (!fs.existsSync(nodePath)) {
      throw new Error(`Node binary not found after extraction at ${nodePath}`);
    }
    try {
      // On Windows, npm.cmd is a batch script — run it directly, not through node.exe.
      const installCmd = isWindows()
        ? `"${npmPath}" install -g openclaw@latest`
        : `"${nodePath}" "${npmPath}" install -g openclaw@latest`;
      execSync(installCmd, {
        timeout: 120000,
        stdio: 'pipe',
      });
      onProgress(100);
    } catch (err) {
      throw new Error(`Failed to install OpenClaw: ${err}`);
    }
  }

  installedCache = true;
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
 * Start the OpenClaw gateway process.
 * Spawns it as a child process so we can manage its lifecycle.
 */
export async function startGateway(): Promise<void> {
  if (gatewayProcess) {
    return; // Already running
  }

  const nodePath = getNodePath();
  const openclawBin = getOpenClawBinPath();

  if (!fs.existsSync(openclawBin)) {
    throw new Error(`OpenClaw binary not found at ${openclawBin}`);
  }

  console.log(`[openclaw] starting gateway: ${nodePath} ${openclawBin} gateway --port ${GATEWAY_PORT}`);

  // On Windows, openclaw.cmd is a batch script — spawn it directly with shell: true
  // so cmd.exe handles it. On macOS/Linux, run it through our bundled node binary.
  gatewayProcess = isWindows()
    ? spawn(openclawBin, ['gateway', '--port', String(GATEWAY_PORT)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: true,
      })
    : spawn(nodePath, [openclawBin, 'gateway', '--port', String(GATEWAY_PORT)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

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
