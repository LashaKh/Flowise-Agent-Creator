import { useState, type ChangeEvent } from 'react';
import type { PermissionConfigValue } from '../types';

interface PermissionConfigProps {
  value: PermissionConfigValue;
  onChange: (value: PermissionConfigValue) => void;
}

// Tool categories with their tools
const TOOL_CATEGORIES = [
  {
    name: 'Internet',
    tools: [
      { id: 'web_search', label: 'Web Search' },
      { id: 'web_fetch', label: 'Web Fetch' },
      { id: 'browser.click', label: 'Browser Click' },
      { id: 'browser.type', label: 'Browser Type' },
      { id: 'browser.download', label: 'Browser Download' },
    ],
  },
  {
    name: 'File Access',
    tools: [
      { id: 'read', label: 'Read' },
      { id: 'ls', label: 'List (ls)' },
      { id: 'write', label: 'Write' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete' },
    ],
  },
  {
    name: 'Code Execution',
    tools: [
      { id: 'exec', label: 'Execute' },
      { id: 'exec.sudo', label: 'Execute (sudo)' },
    ],
  },
  {
    name: 'Calendar & Email',
    tools: [
      { id: 'calendar.read', label: 'Calendar Read' },
      { id: 'calendar.create', label: 'Calendar Create' },
      { id: 'email.send', label: 'Email Send' },
    ],
  },
  {
    name: 'Knowledge Base',
    tools: [
      { id: 'memory_search', label: 'Memory Search' },
    ],
  },
];

const SAFETY_LEVELS = [
  { id: 'paranoid' as const, label: 'Paranoid', desc: 'Confirm every action' },
  { id: 'balanced' as const, label: 'Balanced', desc: 'Confirm risky actions only' },
  { id: 'relaxed' as const, label: 'Relaxed', desc: 'Confirm destructive actions only' },
  { id: 'trust' as const, label: 'Trust', desc: 'No confirmations needed' },
];

export function PermissionConfig({ value, onChange }: PermissionConfigProps) {
  const [newPath, setNewPath] = useState('');

  const toggleTool = (toolId: string) => {
    const enabled = value.enabledTools.includes(toolId);
    onChange({
      ...value,
      enabledTools: enabled
        ? value.enabledTools.filter((t) => t !== toolId)
        : [...value.enabledTools, toolId],
    });
  };

  const addPath = () => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    if (value.allowedPaths.some((p) => p.path === trimmed)) return;
    onChange({
      ...value,
      allowedPaths: [...value.allowedPaths, { path: trimmed, mode: 'read' }],
    });
    setNewPath('');
  };

  const removePath = (path: string) => {
    onChange({
      ...value,
      allowedPaths: value.allowedPaths.filter((p) => p.path !== path),
    });
  };

  const togglePathMode = (path: string) => {
    onChange({
      ...value,
      allowedPaths: value.allowedPaths.map((p) =>
        p.path === path ? { ...p, mode: p.mode === 'read' ? 'readwrite' : 'read' } : p
      ),
    });
  };

  return (
    <div className="space-y-6">
      {/* Tool Categories */}
      <div>
        <h4 className="text-sm font-display font-semibold text-cosmic-cyan uppercase tracking-wide mb-3">
          Tool Permissions
        </h4>
        <div className="space-y-4">
          {TOOL_CATEGORIES.map((category) => (
            <div key={category.name} className="glass rounded-xl p-4 border border-white/5">
              <p className="text-xs font-display font-semibold text-gray-300 uppercase tracking-wide mb-2">
                {category.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {category.tools.map((tool) => {
                  const checked = value.enabledTools.includes(tool.id);
                  return (
                    <label
                      key={tool.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm font-body transition-all border ${
                        checked
                          ? 'bg-cosmic-cyan/10 border-cosmic-cyan/30 text-white'
                          : 'bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/10'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTool(tool.id)}
                        className="sr-only"
                      />
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                        checked ? 'bg-cosmic-cyan border-cosmic-cyan' : 'border-gray-600'
                      }`}>
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {tool.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Allowed Folders */}
      <div>
        <h4 className="text-sm font-display font-semibold text-cosmic-cyan uppercase tracking-wide mb-3">
          Allowed Folders
        </h4>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newPath}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPath())}
            placeholder="~/Documents"
            className="flex-1 px-4 py-2.5 glass border border-white/10 rounded-lg text-white font-body text-sm placeholder:text-gray-500 focus:border-cosmic-cyan/30 transition-colors"
          />
          <button
            type="button"
            onClick={addPath}
            className="px-4 py-2.5 glass border border-white/10 rounded-lg text-sm font-display font-semibold text-cosmic-cyan hover:border-cosmic-cyan/30 transition-colors"
          >
            Add
          </button>
        </div>
        {value.allowedPaths.length > 0 && (
          <div className="space-y-2">
            {value.allowedPaths.map((p) => (
              <div key={p.path} className="flex items-center gap-3 glass rounded-lg px-4 py-2.5 border border-white/5">
                <span className="flex-1 text-sm font-body text-gray-300 truncate">{p.path}</span>
                <button
                  type="button"
                  onClick={() => togglePathMode(p.path)}
                  className={`px-2.5 py-1 text-xs font-display font-semibold rounded-md border transition-colors ${
                    p.mode === 'readwrite'
                      ? 'bg-cosmic-magenta/10 border-cosmic-magenta/30 text-cosmic-magenta'
                      : 'bg-cosmic-cyan/10 border-cosmic-cyan/30 text-cosmic-cyan'
                  }`}
                >
                  {p.mode === 'readwrite' ? 'Read/Write' : 'Read Only'}
                </button>
                <button
                  type="button"
                  onClick={() => removePath(p.path)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        {value.allowedPaths.length === 0 && (
          <p className="text-xs text-gray-500 font-body">No folders added yet. The persona will only access its workspace.</p>
        )}
      </div>

      {/* Safety Level */}
      <div>
        <h4 className="text-sm font-display font-semibold text-cosmic-cyan uppercase tracking-wide mb-3">
          Safety Level
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {SAFETY_LEVELS.map((level) => (
            <label
              key={level.id}
              className={`flex flex-col px-4 py-3 rounded-xl cursor-pointer border transition-all ${
                value.confirmationLevel === level.id
                  ? 'bg-cosmic-cyan/10 border-cosmic-cyan/30'
                  : 'glass border-white/5 hover:border-white/10'
              }`}
            >
              <input
                type="radio"
                name="safety-level"
                checked={value.confirmationLevel === level.id}
                onChange={() => onChange({ ...value, confirmationLevel: level.id })}
                className="sr-only"
              />
              <span className={`text-sm font-display font-semibold ${
                value.confirmationLevel === level.id ? 'text-cosmic-cyan' : 'text-gray-300'
              }`}>
                {level.label}
              </span>
              <span className="text-xs text-gray-500 font-body mt-0.5">{level.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div>
        <h4 className="text-sm font-display font-semibold text-cosmic-cyan uppercase tracking-wide mb-3">
          Options
        </h4>
        <div className="space-y-3">
          <ToggleRow
            label="Activity Logging"
            description="Log all persona actions for review"
            checked={value.activityLogging}
            onChange={(v) => onChange({ ...value, activityLogging: v })}
          />
          <ToggleRow
            label="Undo / Rollback"
            description="Allow reverting persona actions"
            checked={value.undoEnabled}
            onChange={(v) => onChange({ ...value, undoEnabled: v })}
          />
          <ToggleRow
            label="Sandbox Mode"
            description="Run in isolated container (requires Docker)"
            checked={value.sandboxEnabled}
            onChange={(v) => onChange({ ...value, sandboxEnabled: v })}
          />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between glass rounded-xl px-4 py-3 border border-white/5">
      <div>
        <p className="text-sm font-display font-semibold text-gray-200">{label}</p>
        <p className="text-xs text-gray-500 font-body">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-cosmic-cyan' : 'bg-gray-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
