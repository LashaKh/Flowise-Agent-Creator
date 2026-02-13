/**
 * OpenClaw Config Factory
 *
 * Generates per-persona OpenClaw agent configurations from synced PersonaConfig.
 * Think of this as translating a persona's "job description" (from the web platform)
 * into instructions the local AI agent framework can understand.
 */
import type { PersonaConfig } from '../src/types';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const AGENTS_DIR = path.join(os.homedir(), '.openclaw', 'agents');
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

export interface OpenClawConfig {
  personaId: string;
  name: string;
  soulPath: string;
  tools: string[];
  workspacePath: string;
  memoryPath: string;
}

/**
 * Create an OpenClaw agent config from a persona's settings.
 * Generates the SOUL.md file (personality instructions) and tool list.
 */
export function createAgentConfig(persona: PersonaConfig): OpenClawConfig {
  const workspacePath = path.join(AGENTS_DIR, persona.id);
  const memoryPath = path.join(workspacePath, 'memory');
  const soulPath = path.join(workspacePath, 'SOUL.md');

  // Ensure directories exist
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(memoryPath, { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'knowledge'), { recursive: true });

  // Write SOUL.md — the persona's personality and instructions
  const soulContent = buildSoulMd(persona);
  fs.writeFileSync(soulPath, soulContent, 'utf-8');

  // Write AGENTS.md — operating instructions and tool rules
  const agentsContent = buildAgentsMd(persona);
  fs.writeFileSync(path.join(workspacePath, 'AGENTS.md'), agentsContent, 'utf-8');

  // Write IDENTITY.md — persona name and theme summary
  const identityContent = buildIdentityMd(persona);
  fs.writeFileSync(path.join(workspacePath, 'IDENTITY.md'), identityContent, 'utf-8');

  return {
    personaId: persona.id,
    name: persona.name,
    soulPath,
    tools: persona.enabledTools,
    workspacePath,
    memoryPath,
  };
}

/** Human-readable descriptions for each tool the AI can use. */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  read: 'Read the contents of a file',
  ls: 'List files and folders in a directory',
  write: 'Create or overwrite a file',
  edit: 'Edit part of an existing file',
  exec: 'Run a shell command',
  web_search: 'Search the web for information',
  web_fetch: 'Fetch and read the contents of a URL',
};

/**
 * Build the SOUL.md content — this is what gives the AI its personality.
 */
function buildSoulMd(persona: PersonaConfig): string {
  const sections = [
    `# ${persona.name}`,
    '',
    persona.systemPrompt,
  ];

  // Tools section — only show if persona has tools enabled
  if (persona.enabledTools.length > 0) {
    sections.push(
      '',
      '## Available Tools',
      '',
      'You have access to the following tools. Use them when the user asks you to perform these actions.',
      '',
      ...persona.enabledTools.map((tool) => {
        const desc = TOOL_DESCRIPTIONS[tool] ?? tool;
        return `- **${tool}**: ${desc}`;
      }),
    );
  }

  // Paths section — only show if persona has paths configured
  if (persona.allowedPaths.length > 0) {
    sections.push(
      '',
      '## Allowed Paths',
      '',
      'You can access files within these directories:',
      '',
      ...persona.allowedPaths.map(
        (p) => `- \`${p.path}\` (${p.mode === 'readwrite' ? 'read + write' : 'read only'})`
      ),
    );
  }

  sections.push(
    '',
    '## Guidelines',
    '',
    '- Always ask for confirmation before modifying files',
    '- Never access paths outside the allowed list',
    '- Be transparent about what actions you are taking',
    `- Confirmation level: ${persona.confirmationLevel}`,
  );

  if (persona.settings.customInstructions) {
    sections.push('', '## Custom Instructions', '', persona.settings.customInstructions);
  }

  return sections.join('\n');
}

/**
 * Build AGENTS.md — operating instructions that tell OpenClaw how to behave.
 */
function buildAgentsMd(persona: PersonaConfig): string {
  const sections = [
    '# Agent Operating Instructions',
    '',
    `Agent: ${persona.name}`,
    `Confirmation Level: ${persona.confirmationLevel}`,
    '',
    '## Tool Rules',
    '',
    ...persona.enabledTools.map((tool) => `- ${tool}: allowed`),
    '',
    '## Path Access',
    '',
    '### Allowed',
    ...persona.allowedPaths.map((p) => `- ${p.path} (${p.mode})`),
    '',
    '### Blocked',
    ...(persona.blockedPaths.length > 0
      ? persona.blockedPaths.map((p) => `- ${p}`)
      : ['- (none configured)']),
    '',
    '## Behavior',
    '',
    '- Respect the confirmation level setting',
    '- Never access paths outside the allowed list',
    '- Log all actions for the activity feed',
  ];

  return sections.join('\n');
}

/**
 * Build IDENTITY.md — who the persona is (name + personality summary).
 */
function buildIdentityMd(persona: PersonaConfig): string {
  const sections = [
    `# ${persona.name}`,
    '',
    `ID: ${persona.id}`,
    `Status: ${persona.status}`,
    '',
    '## Personality',
    '',
    persona.systemPrompt.slice(0, 500) + (persona.systemPrompt.length > 500 ? '...' : ''),
  ];

  if (persona.settings.customInstructions) {
    sections.push('', '## Custom Instructions', '', persona.settings.customInstructions);
  }

  return sections.join('\n');
}

/**
 * Remove an agent's workspace (when persona is deactivated).
 */
export function removeAgentConfig(personaId: string): void {
  const workspacePath = path.join(AGENTS_DIR, personaId);
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true });
  }
}

/**
 * Get all active agent configs from disk.
 */
export function getActiveConfigs(): string[] {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs.readdirSync(AGENTS_DIR).filter((name) => {
    const soulPath = path.join(AGENTS_DIR, name, 'SOUL.md');
    return fs.existsSync(soulPath);
  });
}

/**
 * Register an agent in the OpenClaw config file (~/.openclaw/openclaw.json).
 * This tells the gateway about the new agent so it can route messages to it.
 */
export function registerAgentInConfig(personaId: string, workspacePath: string): void {
  const config = readOpenClawConfig();
  if (!config.agents) config.agents = { defaults: {}, list: [] };
  if (!config.agents.list) config.agents.list = [];

  // Don't add duplicates
  const existing = config.agents.list.find((a) => a.id === personaId);
  if (existing) return;

  config.agents.list.push({
    id: personaId,
    workspace: workspacePath,
  });

  writeOpenClawConfig(config);
}

/**
 * Remove an agent from the OpenClaw config file.
 */
export function unregisterAgentFromConfig(personaId: string): void {
  const config = readOpenClawConfig();
  if (!config.agents?.list) return;

  config.agents.list = config.agents.list.filter((a) => a.id !== personaId);
  writeOpenClawConfig(config);
}

// ─── OpenClaw Config Types & Helpers ─────────────

interface AgentEntry {
  id: string;
  workspace: string;
}

interface OpenClawJsonConfig {
  models?: unknown;
  gateway?: unknown;
  agents?: {
    defaults?: { model?: { primary?: string } };
    list?: AgentEntry[];
  };
}

function readOpenClawConfig(): OpenClawJsonConfig {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8')) as OpenClawJsonConfig;
  } catch {
    return {};
  }
}

function writeOpenClawConfig(config: OpenClawJsonConfig): void {
  fs.mkdirSync(path.dirname(OPENCLAW_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
