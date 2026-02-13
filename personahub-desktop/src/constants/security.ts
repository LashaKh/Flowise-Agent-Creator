/**
 * Security Constants — Tool classifications and blocked paths
 *
 * These are the "rules of engagement" for what personas can and can't do.
 * Think of tool tiers like security clearance levels:
 * - Safe = anyone can do it (reading a file)
 * - Guarded = needs supervisor approval (writing a file)
 * - Dangerous = needs special authorization + approval (deleting files)
 * - Blocked = nobody can do it, ever (accessing SSH keys)
 */
import type { ToolClassification } from '../types';

// ─── Tool Classifications ──────────────────────

export const TOOL_CLASSIFICATIONS: ToolClassification[] = [
  // Safe — no confirmation needed
  { tool: 'read', tier: 'safe', description: 'Read file contents' },
  { tool: 'ls', tier: 'safe', description: 'List directory' },
  { tool: 'web_search', tier: 'safe', description: 'Search the internet' },
  { tool: 'web_fetch', tier: 'safe', description: 'Fetch webpage content' },
  { tool: 'memory_search', tier: 'safe', description: 'Search knowledge base' },
  { tool: 'calendar.read', tier: 'safe', description: 'View calendar events' },
  { tool: 'weather', tier: 'safe', description: 'Get weather info' },

  // Guarded — requires user confirmation
  { tool: 'write', tier: 'guarded', description: 'Write/create files' },
  { tool: 'edit', tier: 'guarded', description: 'Modify existing files' },
  { tool: 'exec', tier: 'guarded', description: 'Run shell commands' },
  { tool: 'browser.click', tier: 'guarded', description: 'Click web elements' },
  { tool: 'browser.type', tier: 'guarded', description: 'Type into web forms' },
  { tool: 'email.send', tier: 'guarded', description: 'Send emails' },
  { tool: 'calendar.create', tier: 'guarded', description: 'Create calendar events' },

  // Dangerous — requires explicit enable + confirmation
  { tool: 'delete', tier: 'dangerous', description: 'Delete files' },
  { tool: 'exec.sudo', tier: 'dangerous', description: 'Run as administrator' },
  { tool: 'system.shutdown', tier: 'dangerous', description: 'System control' },
  { tool: 'browser.download', tier: 'dangerous', description: 'Download files' },
  { tool: 'install', tier: 'dangerous', description: 'Install software' },
];

// ─── Blocked Paths (hardcoded, never overridable) ─

export const BLOCKED_PATH_PATTERNS: string[] = [
  '~/.ssh',
  '~/.aws',
  '~/.gnupg',
  '~/.config/gcloud',
  '~/Library/Keychains',
  '~/.password-store',
  '**/node_modules',
  '**/.git',
  '**/passwords*',
  '**/secrets*',
  '**/*.pem',
  '**/*.key',
  '**/credential*',
  '**/token*',
  // Windows equivalents
  '%USERPROFILE%/.ssh',
  '%APPDATA%/gcloud',
];

// ─── Helpers ───────────────────────────────────

export function getToolTier(toolName: string) {
  const classification = TOOL_CLASSIFICATIONS.find((t) => t.tool === toolName);
  return classification?.tier ?? 'blocked'; // unknown tools are blocked by default
}

export function isToolSafe(toolName: string) {
  return getToolTier(toolName) === 'safe';
}

export function isToolBlocked(toolName: string) {
  return getToolTier(toolName) === 'blocked';
}
