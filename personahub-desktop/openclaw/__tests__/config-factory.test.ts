import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PersonaConfig } from '../../src/types';

// Mock fs to prevent actual file writes
vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    readdirSync: vi.fn(() => []),
    rmSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  readdirSync: vi.fn(() => []),
  rmSync: vi.fn(),
}));

import fs from 'node:fs';
import { createAgentConfig } from '../config-factory';

function makePersona(overrides: Partial<PersonaConfig> = {}): PersonaConfig {
  return {
    id: 'test-id-123',
    userId: '',
    name: 'Test Persona',
    systemPrompt: 'You are a helpful test assistant.',
    chatflowId: '',
    apiEndpoint: '',
    status: 'active',
    enabledTools: ['read', 'ls'],
    allowedPaths: [{ path: '~/', mode: 'read' as const }],
    blockedPaths: [],
    confirmationLevel: 'balanced',
    dangerousToolsEnabled: false,
    activityLogging: true,
    undoEnabled: true,
    sandboxEnabled: false,
    knowledgeBaseRefs: [],
    settings: {},
    syncedAt: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('createAgentConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns config with persona ID and name', () => {
    const persona = makePersona();
    const config = createAgentConfig(persona);
    expect(config.personaId).toBe('test-id-123');
    expect(config.name).toBe('Test Persona');
  });

  it('returns enabled tools from persona', () => {
    const persona = makePersona({ enabledTools: ['read', 'ls', 'write'] });
    const config = createAgentConfig(persona);
    expect(config.tools).toEqual(['read', 'ls', 'write']);
  });

  it('creates workspace directories', () => {
    const persona = makePersona();
    createAgentConfig(persona);
    // Should call mkdirSync for workspace, memory, and knowledge dirs
    expect(fs.mkdirSync).toHaveBeenCalledTimes(3);
  });

  it('writes SOUL.md with persona name', () => {
    const persona = makePersona({ name: 'Einstein Bot' });
    createAgentConfig(persona);
    // Check that writeFileSync was called with content containing the persona name
    const calls = vi.mocked(fs.writeFileSync).mock.calls;
    const soulCall = calls.find((c) => String(c[0]).endsWith('SOUL.md'));
    expect(soulCall).toBeDefined();
    expect(String(soulCall![1])).toContain('# Einstein Bot');
  });

  it('writes SOUL.md with system prompt', () => {
    const persona = makePersona({ systemPrompt: 'You are a quantum physics expert.' });
    createAgentConfig(persona);
    const calls = vi.mocked(fs.writeFileSync).mock.calls;
    const soulCall = calls.find((c) => String(c[0]).endsWith('SOUL.md'));
    expect(String(soulCall![1])).toContain('You are a quantum physics expert.');
  });

  it('writes AGENTS.md and IDENTITY.md', () => {
    const persona = makePersona();
    createAgentConfig(persona);
    const paths = vi.mocked(fs.writeFileSync).mock.calls.map((c) => String(c[0]));
    expect(paths.some((p) => p.endsWith('AGENTS.md'))).toBe(true);
    expect(paths.some((p) => p.endsWith('IDENTITY.md'))).toBe(true);
  });
});
