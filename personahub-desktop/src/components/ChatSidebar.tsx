import { useState, useEffect, useRef } from 'react';

interface ChatSidebarProps {
  personas: Array<{
    id: string;
    name: string;
    lastMessage?: string;
    unread: boolean;
    avatar?: string;
    pinned?: boolean;
    messageCount?: number;
    lastActiveAt?: string | null;
  }>;
  activePersonaId: string | null;
  onSelectPersona: (personaId: string) => void;
  onPersonaCreated: () => void;
  onDeletePersona: (id: string) => void;
  onEditPersona: (id: string) => void;
  onDuplicatePersona: (id: string) => void;
  onClearHistory: (id: string) => void;
  onExportPersona: (id: string) => void;
  onRenamePersona: (id: string, newName: string) => void;
  onTogglePin: (id: string) => void;
  onImportPersona: (json: string) => void;
}

export default function ChatSidebar({
  personas,
  activePersonaId,
  onSelectPersona,
  onPersonaCreated,
  onDeletePersona,
  onEditPersona,
  onDuplicatePersona,
  onClearHistory,
  onExportPersona,
  onRenamePersona,
  onTogglePin,
  onImportPersona,
}: ChatSidebarProps) {
  const [showModal, setShowModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [description, setDescription] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [confirmationLevel, setConfirmationLevel] = useState('balanced');
  const [error, setError] = useState('');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // Inline rename state
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sort: pinned first, then alphabetical
  const sorted = [...personas].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.name.localeCompare(b.name);
  });

  // Close context menu on click-outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    function handleClose(e: MouseEvent | KeyboardEvent) {
      if ('key' in e && e.key !== 'Escape') return;
      setContextMenu(null);
    }
    document.addEventListener('click', handleClose);
    document.addEventListener('keydown', handleClose);
    return () => {
      document.removeEventListener('click', handleClose);
      document.removeEventListener('keydown', handleClose);
    };
  }, [contextMenu]);

  // Focus rename input when editing starts
  useEffect(() => {
    if (editingNameId) renameInputRef.current?.focus();
  }, [editingNameId]);

  function resetForm() {
    setNewName('');
    setDescription('');
    setShowAdvanced(false);
    setTemperature(0.7);
    setConfirmationLevel('balanced');
    setError('');
  }

  function closeModal() {
    setShowModal(false);
    resetForm();
  }

  async function handleCreate() {
    const name = newName.trim();
    const desc = description.trim();
    if (!name) return;
    if (!desc) { setError('Please add a short description'); return; }

    setIsCreating(true);
    setError('');

    try {
      const result = await window.electronAPI.agent.createPersona(name, desc, {
        temperature,
        confirmationLevel,
      });

      closeModal();
      setIsCreating(false);
      onPersonaCreated();

      if (result?.id) {
        onSelectPersona(result.id);
      }
    } catch (err) {
      console.error('Failed to create persona:', err);
      setError(err instanceof Error ? err.message : 'Failed to create persona');
      setIsCreating(false);
    }
  }

  function handleContextMenu(e: React.MouseEvent, id: string) {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  }

  function handleRenameStart(id: string) {
    const persona = personas.find((p) => p.id === id);
    if (!persona) return;
    setEditingNameId(id);
    setEditingNameValue(persona.name);
    setContextMenu(null);
  }

  function handleRenameSubmit() {
    if (editingNameId && editingNameValue.trim()) {
      onRenamePersona(editingNameId, editingNameValue.trim());
    }
    setEditingNameId(null);
    setEditingNameValue('');
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportPersona(reader.result);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  }

  /** Format "2h ago" style relative time */
  function relativeTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  const pinnedPersonas = sorted.filter((p) => p.pinned);
  const unpinnedPersonas = sorted.filter((p) => !p.pinned);

  function handleMenuButtonClick(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ id, x: rect.right, y: rect.bottom + 4 });
  }

  function renderPersonaItem(persona: typeof personas[0]) {
    const isActive = persona.id === activePersonaId;
    const isEditing = editingNameId === persona.id;
    const avatarChar = persona.avatar || persona.name.charAt(0).toUpperCase();
    const isEmoji = persona.avatar && persona.avatar.length <= 2;

    return (
      <div
        key={persona.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelectPersona(persona.id)}
        onContextMenu={(e) => handleContextMenu(e, persona.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSelectPersona(persona.id); }}
        className={`group w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors cursor-pointer ${
          isActive
            ? 'bg-indigo-600/20 border-l-2 border-l-indigo-500'
            : 'hover:bg-gray-800/50'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Avatar */}
          <span className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs flex-shrink-0">
            {isEmoji ? persona.avatar : avatarChar}
          </span>

          {/* Name or rename input */}
          {isEditing ? (
            <input
              ref={renameInputRef}
              value={editingNameValue}
              onChange={(e) => setEditingNameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') { setEditingNameId(null); setEditingNameValue(''); }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-gray-800 border border-indigo-500 rounded px-1 py-0.5 text-sm text-white focus:outline-none min-w-0"
            />
          ) : (
            <span
              className={`text-sm font-medium truncate flex-1 ${
                isActive ? 'text-white' : 'text-gray-300'
              }`}
            >
              {persona.name}
            </span>
          )}

          {persona.pinned && (
            <span className="text-[10px] text-gray-500 flex-shrink-0" title="Pinned">
              *
            </span>
          )}
          {persona.unread && (
            <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
          )}

          {/* ··· menu button — visible on hover or when this persona's menu is open */}
          <button
            onClick={(e) => handleMenuButtonClick(e, persona.id)}
            className={`w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-700 transition-colors text-xs leading-none flex-shrink-0 ${
              contextMenu?.id === persona.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            title="Menu"
          >
            ···
          </button>
        </div>
        {/* Stats line */}
        {(persona.messageCount || persona.lastActiveAt) && (
          <p className="text-[11px] text-gray-500 truncate mt-0.5 ml-8">
            {persona.messageCount ? `${persona.messageCount} msgs` : ''}
            {persona.messageCount && persona.lastActiveAt ? ' · ' : ''}
            {persona.lastActiveAt ? relativeTime(persona.lastActiveAt) : ''}
          </p>
        )}
        {persona.lastMessage && !persona.messageCount && (
          <p className="text-xs text-gray-500 truncate mt-1 ml-8">
            {persona.lastMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Conversations</h2>
        <div className="flex items-center gap-1">
          {/* Import button */}
          <button
            onClick={handleImportClick}
            title="Import persona"
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-xs leading-none"
          >
            &darr;
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          {/* New persona button */}
          <button
            onClick={() => setShowModal(true)}
            title="New persona"
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-lg leading-none"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {personas.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <p className="text-gray-500 text-sm text-center">
              No personas yet. Click + to create one.
            </p>
          </div>
        ) : (
          <>
            {pinnedPersonas.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                  Pinned
                </div>
                {pinnedPersonas.map(renderPersonaItem)}
                {unpinnedPersonas.length > 0 && (
                  <div className="px-4 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
                    All
                  </div>
                )}
              </>
            )}
            {unpinnedPersonas.map(renderPersonaItem)}
          </>
        )}
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {[
            { label: 'Rename', action: () => handleRenameStart(contextMenu.id) },
            { label: 'Edit Settings', action: () => { onEditPersona(contextMenu.id); setContextMenu(null); } },
            { label: personas.find((p) => p.id === contextMenu.id)?.pinned ? 'Unpin' : 'Pin', action: () => { onTogglePin(contextMenu.id); setContextMenu(null); } },
            { label: 'Duplicate', action: () => { onDuplicatePersona(contextMenu.id); setContextMenu(null); } },
            { label: 'Export', action: () => { onExportPersona(contextMenu.id); setContextMenu(null); } },
            { label: 'Clear History', action: () => { onClearHistory(contextMenu.id); setContextMenu(null); } },
            { label: '---' },
            { label: 'Delete', action: () => { onDeletePersona(contextMenu.id); setContextMenu(null); }, danger: true },
          ].map((item, i) =>
            item.label === '---' ? (
              <div key={i} className="border-t border-gray-700 my-1" />
            ) : (
              <button
                key={i}
                onClick={item.action}
                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  item.danger
                    ? 'text-red-400 hover:bg-red-900/30'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}

      {/* ── Creation Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-lg w-[420px] max-h-[90vh] overflow-y-auto shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="text-base font-semibold text-white">New Persona</h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-white text-lg leading-none"
                disabled={isCreating}
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
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Lex, Chef Maria, Dr. Ada..."
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  disabled={isCreating}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Legal expert who explains complex law simply..."
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
                  disabled={isCreating}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  The AI will generate a full personality from this description.
                </p>
              </div>

              {/* Advanced toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                disabled={isCreating}
              >
                {showAdvanced ? 'Hide' : 'Show'} advanced options
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-1">
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
                      disabled={isCreating}
                    />
                    <div className="flex justify-between text-[10px] text-gray-600">
                      <span>Precise</span>
                      <span>Creative</span>
                    </div>
                  </div>

                  {/* Confirmation level */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Confirmation Level</label>
                    <select
                      value={confirmationLevel}
                      onChange={(e) => setConfirmationLevel(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      disabled={isCreating}
                    >
                      <option value="paranoid">Paranoid — confirm everything</option>
                      <option value="balanced">Balanced — confirm risky actions</option>
                      <option value="relaxed">Relaxed — confirm dangerous only</option>
                      <option value="trust">Trust — no confirmations</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || !newName.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center gap-2"
              >
                {isCreating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
