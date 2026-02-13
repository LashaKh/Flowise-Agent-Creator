import { useState, useEffect } from 'react';
import type { PersonaConfig, ConfirmationLevel, KnowledgeDocument, PathPermission } from '../types';

const EMOJI_OPTIONS = [
  '🤖', '👨‍⚕️', '👩‍💼', '👨‍🍳', '📚', '🎨', '🧑‍🔬', '💼',
  '🎵', '⚖️', '🏋️', '🌍', '🧠', '💡', '🔧', '🎭',
  '🐱', '🦊', '🌟', '🚀',
];

const MODEL_OPTIONS = [
  { value: '', label: 'Default (from config)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'claude-opus-4', label: 'Claude Opus 4' },
];

const AVAILABLE_TOOLS: { name: string; label: string; tier: 'safe' | 'guarded' }[] = [
  { name: 'read', label: 'Read files', tier: 'safe' },
  { name: 'ls', label: 'List directories', tier: 'safe' },
  { name: 'web_search', label: 'Web search', tier: 'safe' },
  { name: 'web_fetch', label: 'Fetch URLs', tier: 'safe' },
  { name: 'write', label: 'Write files', tier: 'guarded' },
  { name: 'edit', label: 'Edit files', tier: 'guarded' },
  { name: 'exec', label: 'Run commands', tier: 'guarded' },
];

interface PersonaSettingsPanelProps {
  personaId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function PersonaSettingsPanel({
  personaId,
  onClose,
  onSaved,
}: PersonaSettingsPanelProps) {
  const [persona, setPersona] = useState<PersonaConfig | null>(null);
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [confirmationLevel, setConfirmationLevel] = useState<ConfirmationLevel>('balanced');
  const [modelName, setModelName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState('');
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [allowedPaths, setAllowedPaths] = useState<PathPermission[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Load persona data + knowledge docs on mount
  useEffect(() => {
    async function load() {
      const p = await window.electronAPI.agent.getPersona(personaId);
      if (!p) return;
      setPersona(p);
      setName(p.name);
      setSystemPrompt(p.systemPrompt);
      setTemperature(p.settings.temperature ?? 0.7);
      setConfirmationLevel(p.confirmationLevel);
      setModelName(p.settings.modelName ?? '');
      setAvatar(p.settings.avatar ?? '');
      setEnabledTools(p.enabledTools ?? []);
      setAllowedPaths(p.allowedPaths ?? []);

      const docs = await window.electronAPI.agent.listKnowledgeDocs(personaId);
      setKnowledgeDocs(docs);
    }
    load();
  }, [personaId]);

  async function handleSave() {
    if (!name.trim()) return;
    setIsSaving(true);
    setError('');

    try {
      await window.electronAPI.agent.updatePersona(personaId, {
        name: name.trim(),
        systemPrompt,
        confirmationLevel,
        enabledTools,
        allowedPaths,
        settings: { temperature, modelName: modelName || undefined, avatar: avatar || undefined },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    setError('');

    try {
      const result = await window.electronAPI.agent.regeneratePrompt(personaId);
      setSystemPrompt(result.systemPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setIsRegenerating(false);
    }
  }

  async function handleUploadDoc() {
    setIsUploading(true);
    setError('');

    try {
      // Opens a native file picker from the main process
      const doc = await window.electronAPI.agent.uploadKnowledgeDoc(personaId);
      if (doc) setKnowledgeDocs((prev) => [doc, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteDoc(docId: string) {
    try {
      await window.electronAPI.agent.deleteKnowledgeDoc(docId);
      setKnowledgeDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const FILE_TYPE_LABELS: Record<string, string> = {
    pdf: 'PDF',
    docx: 'DOC',
    txt: 'TXT',
    md: 'MD',
  };

  if (!persona) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-8">
          <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-[520px] max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-base font-semibold text-white">Edit Persona</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            x
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Emoji Avatar */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Avatar</label>
            <div className="flex flex-wrap gap-1.5">
              {/* Clear option */}
              <button
                onClick={() => setAvatar('')}
                className={`w-8 h-8 rounded flex items-center justify-center text-xs border transition-colors ${
                  !avatar ? 'border-indigo-500 bg-indigo-600/20' : 'border-gray-700 hover:border-gray-500'
                }`}
                title="Default (first letter)"
              >
                Aa
              </button>
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setAvatar(emoji)}
                  className={`w-8 h-8 rounded flex items-center justify-center text-base border transition-colors ${
                    avatar === emoji ? 'border-indigo-500 bg-indigo-600/20' : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">System Prompt</label>
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1"
              >
                {isRegenerating && (
                  <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin inline-block" />
                )}
                Regenerate
              </button>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 font-mono focus:border-indigo-500 focus:outline-none resize-y"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="flex items-center justify-between text-sm text-gray-400 mb-1">
              <span>Temperature</span>
              <span className="text-xs text-gray-500">{temperature.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Model</label>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Confirmation Level */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Confirmation Level</label>
            <select
              value={confirmationLevel}
              onChange={(e) => setConfirmationLevel(e.target.value as ConfirmationLevel)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="paranoid">Paranoid — confirm everything</option>
              <option value="balanced">Balanced — confirm risky actions</option>
              <option value="relaxed">Relaxed — confirm dangerous only</option>
              <option value="trust">Trust — no confirmations</option>
            </select>
          </div>

          {/* Enabled Tools */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Enabled Tools</label>
            <div className="space-y-1.5">
              {AVAILABLE_TOOLS.map((tool) => (
                <label
                  key={tool.name}
                  className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2 cursor-pointer hover:bg-gray-750"
                >
                  <input
                    type="checkbox"
                    checked={enabledTools.includes(tool.name)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEnabledTools((prev) => [...prev, tool.name]);
                      } else {
                        setEnabledTools((prev) => prev.filter((t) => t !== tool.name));
                      }
                    }}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-300">{tool.label}</span>
                  <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ml-auto ${
                    tool.tier === 'safe'
                      ? 'bg-green-900/50 text-green-400'
                      : 'bg-yellow-900/50 text-yellow-400'
                  }`}>
                    {tool.tier === 'safe' ? 'Safe' : 'Guarded'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Allowed Paths */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-400">Allowed Paths</label>
              <button
                onClick={() => setAllowedPaths((prev) => [...prev, { path: '~/', mode: 'read' }])}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded transition-colors"
              >
                Add Path
              </button>
            </div>
            {allowedPaths.length === 0 ? (
              <p className="text-xs text-gray-500 bg-gray-800/50 rounded p-3">
                No paths configured. The persona cannot access any files or directories.
              </p>
            ) : (
              <div className="space-y-1.5">
                {allowedPaths.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2">
                    <input
                      type="text"
                      value={entry.path}
                      onChange={(e) => {
                        const next = [...allowedPaths];
                        next[idx] = { ...entry, path: e.target.value };
                        setAllowedPaths(next);
                      }}
                      placeholder="~/Documents"
                      className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <select
                      value={entry.mode}
                      onChange={(e) => {
                        const next = [...allowedPaths];
                        next[idx] = { ...entry, mode: e.target.value as 'read' | 'readwrite' };
                        setAllowedPaths(next);
                      }}
                      className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="read">Read</option>
                      <option value="readwrite">Read+Write</option>
                    </select>
                    <button
                      onClick={() => setAllowedPaths((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-gray-500 hover:text-red-400 text-sm transition-colors"
                      title="Remove path"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Knowledge Base */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-400">Knowledge Base</label>
              <button
                onClick={handleUploadDoc}
                disabled={isUploading}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-2.5 py-1 rounded transition-colors flex items-center gap-1"
              >
                {isUploading ? (
                  <>
                    <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    Uploading...
                  </>
                ) : (
                  'Upload Document'
                )}
              </button>
            </div>

            {knowledgeDocs.length === 0 ? (
              <p className="text-xs text-gray-500 bg-gray-800/50 rounded p-3">
                No documents yet. Upload PDFs, Word docs, or text files to give this persona specialized knowledge.
              </p>
            ) : (
              <div className="space-y-1.5">
                {knowledgeDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between bg-gray-800 rounded px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold bg-gray-700 text-gray-300 rounded px-1.5 py-0.5 shrink-0">
                        {FILE_TYPE_LABELS[doc.fileType] ?? doc.fileType.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-300 truncate">{doc.title}</span>
                      <span className="text-[10px] text-gray-500 shrink-0">{formatFileSize(doc.fileSize)}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="text-gray-500 hover:text-red-400 text-sm ml-2 shrink-0 transition-colors"
                      title="Remove document"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
