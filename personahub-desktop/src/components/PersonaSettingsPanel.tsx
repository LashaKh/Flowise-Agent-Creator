import { useState, useEffect } from 'react';
import type { PersonaConfig, ConfirmationLevel, KnowledgeDocument, PathPermission, AvatarStyleId } from '../types';
import VoicePicker from './VoicePicker';
import FacePicker from './FacePicker';
import Modal from './Modal';
import ModelPicker from './ModelPicker';

const EMOJI_OPTIONS = [
  '🤖', '👨‍⚕️', '👩‍💼', '👨‍🍳', '📚', '🎨', '🧑‍🔬', '💼',
  '🎵', '⚖️', '🏋️', '🌍', '🧠', '💡', '🔧', '🎭',
  '🐱', '🦊', '🌟', '🚀',
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
  // Voice & Avatar state (audit finding P1-4 / P3-D-4)
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  const [avatarStyleId, setAvatarStyleId] = useState<AvatarStyleId>('face-warm');
  const [avatarAccentHue, setAvatarAccentHue] = useState<number>(0);

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
      setVoiceId(p.settings.voiceId);
      setAvatarStyleId((p.settings.avatarStyleId as AvatarStyleId) || 'face-warm');
      setAvatarAccentHue(p.settings.avatarAccentHue ?? 0);

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
        settings: {
          temperature,
          modelName: modelName || undefined,
          avatar: avatar || undefined,
          voiceId,
          avatarStyleId,
          avatarAccentHue,
        },
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
      <Modal
        isOpen={true}
        onClose={onClose}
        className="bg-gray-900 border border-gray-700 rounded-lg p-8"
      >
        <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={true}
      onClose={() => { if (!isSaving) onClose(); }}
      labelledBy="edit-persona-title"
      className="bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 border border-gray-800 rounded-2xl w-[min(920px,95vw)] max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
      closeOnBackdrop={!isSaving}
    >
      <>
        {/* Sticky header with avatar preview */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-xl shadow-lg shadow-indigo-900/30 shrink-0">
              {avatar || (name || persona.name).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 id="edit-persona-title" className="text-lg font-semibold text-white tracking-tight truncate">
                {name || persona.name}
              </h3>
              <p className="text-xs text-gray-500">Customize identity, behavior, and capabilities</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Identity card */}
            <SectionCard title="Identity" icon="👤">
              <div>
                <Label>Name</Label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <Label>Avatar</Label>
                <div className="flex flex-wrap gap-1.5">
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
            </SectionCard>

            {/* Model card */}
            <SectionCard title="AI Model" icon="✨">
              <ModelPicker value={modelName} onChange={setModelName} />
            </SectionCard>

            {/* Voice & Avatar card */}
            <SectionCard title="Voice & Avatar" icon="🎙">
              <div>
                <Label>Voice</Label>
                <VoicePicker
                  selectedVoiceId={voiceId}
                  personaName={persona?.name}
                  onChange={setVoiceId}
                />
              </div>
              <div className="pt-3 border-t border-gray-800/60">
                <Label>Face style</Label>
                <FacePicker
                  selectedStyleId={avatarStyleId}
                  accentHue={avatarAccentHue}
                  onChange={setAvatarStyleId}
                  onHueChange={setAvatarAccentHue}
                />
              </div>
            </SectionCard>

            {/* Behavior card */}
            <SectionCard title="Behavior" icon="🎛">
              <div>
                <label className="flex items-center justify-between text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  <span>Temperature</span>
                  <span className="text-indigo-400 normal-case tracking-normal font-semibold">{temperature.toFixed(1)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>
              <div className="pt-3 border-t border-gray-800/60">
                <Label>Confirmation Level</Label>
                <select
                  value={confirmationLevel}
                  onChange={(e) => setConfirmationLevel(e.target.value as ConfirmationLevel)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="paranoid">Paranoid — confirm everything</option>
                  <option value="balanced">Balanced — confirm risky actions</option>
                  <option value="relaxed">Relaxed — confirm dangerous only</option>
                  <option value="trust">Trust — no confirmations</option>
                </select>
              </div>
            </SectionCard>

            {/* System Prompt card (full width) */}
            <div className="lg:col-span-2">
              <SectionCard title="System Prompt" icon="📝"
                headerAction={
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
                }
              >
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-y"
                />
              </SectionCard>
            </div>

            {/* Tools card */}
            <SectionCard title="Enabled Tools" icon="🔧">
              <div className="space-y-1.5">
                {AVAILABLE_TOOLS.map((tool) => (
                  <label
                    key={tool.name}
                    className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-800 hover:border-gray-600 transition-colors"
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
            </SectionCard>

            {/* Allowed Paths card */}
            <SectionCard title="Allowed Paths" icon="📁"
              headerAction={
                <button
                  onClick={() => setAllowedPaths((prev) => [...prev, { path: '~/', mode: 'read' }])}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md transition-colors"
                >
                  Add Path
                </button>
              }
            >
              {allowedPaths.length === 0 ? (
                <p className="text-xs text-gray-500 bg-gray-800/40 rounded-lg p-3">
                  No paths configured. The persona cannot access any files or directories.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {allowedPaths.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2">
                      <input
                        type="text"
                        value={entry.path}
                        onChange={(e) => {
                          const next = [...allowedPaths];
                          next[idx] = { ...entry, path: e.target.value };
                          setAllowedPaths(next);
                        }}
                        placeholder="~/Documents"
                        className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
                        className="text-gray-500 hover:text-red-400 text-sm transition-colors shrink-0"
                        title="Remove path"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Knowledge Base card (full width) */}
            <div className="lg:col-span-2">
              <SectionCard title="Knowledge Base" icon="📚"
                headerAction={
                  <button
                    onClick={handleUploadDoc}
                    disabled={isUploading}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-2.5 py-1 rounded-md transition-colors flex items-center gap-1"
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
                }
              >
                {knowledgeDocs.length === 0 ? (
                  <p className="text-xs text-gray-500 bg-gray-800/40 rounded-lg p-3">
                    No documents yet. Upload PDFs, Word docs, or text files to give this persona specialized knowledge.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {knowledgeDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2"
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
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

          </div>

          {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
        </div>

        {/* Sticky footer */}
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-950/80 backdrop-blur flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2 shadow-md shadow-indigo-900/30"
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
      </>
    </Modal>
  );
}

// ─── Subcomponents ──────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
      {children}
    </label>
  );
}

function SectionCard({
  title,
  icon,
  children,
  headerAction,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 backdrop-blur">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-sm opacity-80">{icon}</span>}
          <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
        </div>
        {headerAction}
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
