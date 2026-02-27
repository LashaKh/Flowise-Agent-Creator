import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { expandHome, isPathBlocked } from '../blocked-paths';

describe('expandHome', () => {
  it('expands ~/ to home directory', () => {
    const result = expandHome('~/.ssh');
    expect(result).toBe(path.join(os.homedir(), '.ssh'));
  });

  it('expands bare ~ to home directory', () => {
    const result = expandHome('~');
    expect(result).toBe(os.homedir());
  });

  it('expands %USERPROFILE% to home directory', () => {
    const result = expandHome('%USERPROFILE%/.ssh');
    expect(result).toBe(path.join(os.homedir(), '.ssh'));
  });

  it('expands %APPDATA%', () => {
    const result = expandHome('%APPDATA%/gcloud');
    const expected = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    expect(result).toBe(path.join(expected, 'gcloud'));
  });

  it('expands %LOCALAPPDATA%', () => {
    const result = expandHome('%LOCALAPPDATA%/Microsoft/Vault');
    const expected = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    expect(result).toBe(path.join(expected, 'Microsoft', 'Vault'));
  });

  it('returns non-prefixed paths unchanged', () => {
    const result = expandHome('/usr/local/bin');
    expect(result).toBe('/usr/local/bin');
  });
});

describe('isPathBlocked', () => {
  it('blocks ~/.ssh paths', () => {
    const sshPath = path.join(os.homedir(), '.ssh', 'id_rsa');
    expect(isPathBlocked(sshPath).blocked).toBe(true);
  });

  it('blocks ~/.aws paths', () => {
    const awsPath = path.join(os.homedir(), '.aws', 'credentials');
    expect(isPathBlocked(awsPath).blocked).toBe(true);
  });

  it('blocks **/secrets* pattern', () => {
    const secretsPath = path.join(os.homedir(), 'projects', 'secrets.json');
    expect(isPathBlocked(secretsPath).blocked).toBe(true);
  });

  it('blocks **/*.pem files', () => {
    const pemPath = path.join(os.homedir(), 'certs', 'server.pem');
    expect(isPathBlocked(pemPath).blocked).toBe(true);
  });

  it('blocks **/node_modules', () => {
    const nmPath = path.join(os.homedir(), 'project', 'node_modules', 'pkg', 'index.js');
    expect(isPathBlocked(nmPath).blocked).toBe(true);
  });

  it('allows normal document paths', () => {
    const docsPath = path.join(os.homedir(), 'Documents', 'notes.txt');
    expect(isPathBlocked(docsPath).blocked).toBe(false);
  });

  it('allows normal project files', () => {
    const projectPath = path.join(os.homedir(), 'projects', 'app', 'index.ts');
    expect(isPathBlocked(projectPath).blocked).toBe(false);
  });

  it('returns the matching pattern when blocked', () => {
    const sshPath = path.join(os.homedir(), '.ssh', 'id_rsa');
    const result = isPathBlocked(sshPath);
    expect(result.blocked).toBe(true);
    expect(result.pattern).toBeDefined();
  });
});
