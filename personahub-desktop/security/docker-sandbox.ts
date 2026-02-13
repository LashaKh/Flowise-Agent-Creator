/**
 * Docker Sandbox — Runs shell commands in isolated containers.
 *
 * Think of it like a "clean room" for code execution:
 * - Each command runs in a fresh container
 * - Only allowed folders are visible (mounted read-only)
 * - Results go to an output folder
 * - Container is destroyed after the command finishes
 * - No network access by default
 */
import { execSync, exec } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { PathPermission } from '../src/types';

const SANDBOX_IMAGE = 'personahub-sandbox:latest';
const OUTPUT_DIR = path.join(os.homedir(), '.personahub', 'sandbox-output');

interface SandboxResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Check if Docker is available on this machine.
 */
export function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a shell command inside a Docker container.
 *
 * @param command - The shell command to execute
 * @param allowedPaths - Folders to mount read-only inside the container
 * @param timeoutMs - Max execution time (default 30 seconds)
 */
export async function runInSandbox(
  command: string,
  allowedPaths: PathPermission[],
  timeoutMs: number = 30000
): Promise<SandboxResult> {
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Create a unique output folder for this execution
  const runId = `run-${Date.now()}`;
  const runOutputDir = path.join(OUTPUT_DIR, runId);
  fs.mkdirSync(runOutputDir, { recursive: true });

  // Build Docker run command
  const mounts = allowedPaths.map((p) => {
    const hostPath = p.path.replace('~', os.homedir());
    const containerPath = `/mnt${hostPath}`;
    // All mounts are read-only for safety, output folder is read-write
    return `-v "${hostPath}:${containerPath}:ro"`;
  });

  // Mount output folder as read-write
  mounts.push(`-v "${runOutputDir}:/output:rw"`);

  const dockerCmd = [
    'docker run',
    '--rm',                          // Remove container after execution
    '--network none',                // No network access
    '--memory 512m',                 // Memory limit
    '--cpus 1',                      // CPU limit
    `--stop-timeout ${Math.ceil(timeoutMs / 1000)}`,
    ...mounts,
    '-w /output',                    // Working directory
    SANDBOX_IMAGE,
    `sh -c ${JSON.stringify(command)}`,
  ].join(' ');

  return new Promise((resolve) => {
    const child = exec(dockerCmd, { timeout: timeoutMs }, (error, stdout, stderr) => {
      // Clean up output directory
      try {
        fs.rmSync(runOutputDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }

      resolve({
        success: !error,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
      });
    });

    // Safety timeout
    setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs + 5000);
  });
}

/**
 * Build the sandbox Docker image if it doesn't exist.
 * Uses a minimal Alpine image with common dev tools.
 */
export async function ensureSandboxImage(): Promise<boolean> {
  try {
    execSync(`docker image inspect ${SANDBOX_IMAGE}`, { stdio: 'pipe' });
    return true; // Image already exists
  } catch {
    // Build the image
    const dockerfile = `
FROM alpine:3.19
RUN apk add --no-cache bash python3 nodejs npm git curl
WORKDIR /output
    `.trim();

    const tmpDir = path.join(os.tmpdir(), 'personahub-sandbox-build');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), dockerfile);

    try {
      execSync(`docker build -t ${SANDBOX_IMAGE} ${tmpDir}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
}
