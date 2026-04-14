import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import ChatSidebar from './ChatSidebar';
import Modal from './Modal';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import PersonaSettingsPanel from './PersonaSettingsPanel';
import AvatarFace from './AvatarFace';
import { useChat, clearSessionCache } from '../hooks/useChat';
import { useVoiceOutput } from '../hooks/useVoiceOutput';
import type { GlobalVoicePrefs, AvatarStyleId } from '../types';

interface SidebarPersona {
  id: string;
  name: string;
  lastMessage?: string;
  unread: boolean;
  avatar?: string;
  pinned?: boolean;
  messageCount?: number;
  lastActiveAt?: string | null;
  avatarStyleId?: string;
  avatarAccentHue?: number;
}

export default function ChatWindow() {
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<SidebarPersona[]>([]);
  const [faceCollapsed, setFaceCollapsed] = useState(false);

  // Load global voice prefs so toggling voice in Settings actually takes
  // effect here. Previously the voice hook was hardcoded to voiceEnabled=true
  // and voiceProvider='os-native' — the Settings panel was decorative
  // (audit finding P2-8).
  const [voicePrefs, setVoicePrefs] = useState<GlobalVoicePrefs | null>(null);
  useEffect(() => {
    window.electronAPI.voice
      .getPrefs()
      .then(setVoicePrefs)
      .catch((err) => console.warn('[ChatWindow] Failed to load voice prefs:', err));
  }, []);

  // Voice output hook
  const voiceOutput = useVoiceOutput({
    personaId: activePersonaId,
    voiceEnabled: voicePrefs?.voiceOutputEnabled ?? false,
    voiceProvider: voicePrefs?.defaultProvider ?? 'os-native',
  });

  const { messages, isStreaming, sendMessage } = useChat(activePersonaId, {
    onAssistantDone: voiceOutput.handleAssistantDone,
  });

  // Modal states
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'clearHistory'; id: string } | null>(null);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);

  // Load active personas from the local database with stats
  const loadPersonas = useCallback(async () => {
    try {
      const rows = await window.electronAPI.agent.sidebarList();

      const withStats: SidebarPersona[] = await Promise.all(
        rows.map(async (row) => {
          // Get stats (safe — don't crash if this fails)
          let messageCount = 0;
          let lastActiveAt: string | null = null;
          try {
            const stats = await window.electronAPI.agent.getStats(row.id);
            messageCount = stats.messageCount;
            lastActiveAt = stats.lastActiveAt;
          } catch { /* stats are optional */ }

          // Get last message for preview
          let lastMessage: string | undefined;
          try {
            const preview = await window.electronAPI.chat.getLastMessage(row.id);
            lastMessage = preview ?? undefined;
          } catch { /* optional */ }

          let settings: { avatar?: string; pinned?: boolean; avatarStyleId?: string; avatarAccentHue?: number } = {};
          try { if (row.settings) settings = JSON.parse(row.settings); } catch { /* empty */ }

          return {
            id: row.id,
            name: row.name,
            lastMessage,
            unread: false,
            avatar: settings.avatar,
            pinned: settings.pinned,
            avatarStyleId: settings.avatarStyleId,
            avatarAccentHue: settings.avatarAccentHue,
            messageCount,
            lastActiveAt,
          };
        })
      );

      setPersonas(withStats);
    } catch (err) {
      console.error('Failed to load personas:', err);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadPersonas();
  }, [loadPersonas]);

  // Update last message preview in sidebar when messages change
  useEffect(() => {
    if (!activePersonaId || messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;

    setPersonas((prev) =>
      prev.map((p) =>
        p.id === activePersonaId
          ? { ...p, lastMessage: lastMsg.content.slice(0, 100) }
          : p
      )
    );
  }, [messages, activePersonaId]);

  // ─── Action Handlers ─────────────────────

  async function handleDelete(id: string) {
    try {
      await window.electronAPI.agent.deletePersona(id);
      if (activePersonaId === id) setActivePersonaId(null);
      await loadPersonas();
    } catch (err) {
      console.error('Failed to delete persona:', err);
    }
    setConfirmAction(null);
  }

  async function handleDuplicate(id: string) {
    try {
      const result = await window.electronAPI.agent.duplicatePersona(id);
      await loadPersonas();
      setActivePersonaId(result.id);
    } catch (err) {
      console.error('Failed to duplicate persona:', err);
    }
  }

  async function handleClearHistory(id: string) {
    try {
      await window.electronAPI.agent.clearHistory(id);
      clearSessionCache(id);
      await loadPersonas();
      // If this is the active persona, selecting it again will reload messages
      if (activePersonaId === id) {
        setActivePersonaId(null);
        setTimeout(() => setActivePersonaId(id), 0);
      }
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
    setConfirmAction(null);
  }

  async function handleExport(id: string) {
    try {
      const json = await window.electronAPI.agent.exportPersona(id);
      await navigator.clipboard.writeText(json);
      // Simple visual feedback — could use a toast library later
      toast.success('Persona exported to clipboard');
    } catch (err) {
      console.error('Failed to export persona:', err);
    }
  }

  async function handleImport(json: string) {
    try {
      const result = await window.electronAPI.agent.importPersona(json);
      await loadPersonas();
      setActivePersonaId(result.id);
    } catch (err) {
      console.error('Failed to import persona:', err);
      toast.error('Failed to import: ' + (err instanceof Error ? err.message : 'Invalid file'));
    }
  }

  async function handleRename(id: string, newName: string) {
    try {
      await window.electronAPI.agent.updatePersona(id, { name: newName });
      await loadPersonas();
    } catch (err) {
      console.error('Failed to rename persona:', err);
    }
  }

  async function handleTogglePin(id: string) {
    const persona = personas.find((p) => p.id === id);
    if (!persona) return;
    try {
      await window.electronAPI.agent.updatePersona(id, {
        settings: { pinned: !persona.pinned },
      });
      await loadPersonas();
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  }

  const activePersona = personas.find((p) => p.id === activePersonaId);

  return (
    <div className="flex h-full">
      <ChatSidebar
        personas={personas}
        activePersonaId={activePersonaId}
        onSelectPersona={setActivePersonaId}
        onPersonaCreated={loadPersonas}
        onDeletePersona={(id) => setConfirmAction({ type: 'delete', id })}
        onEditPersona={(id) => setEditingPersonaId(id)}
        onDuplicatePersona={handleDuplicate}
        onClearHistory={(id) => setConfirmAction({ type: 'clearHistory', id })}
        onExportPersona={handleExport}
        onRenamePersona={handleRename}
        onTogglePin={handleTogglePin}
        onImportPersona={handleImport}
      />

      <div className="flex-1 flex flex-col">
        {activePersona ? (
          <>
            {/* Header — two-part flex row */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {activePersona.avatar && (
                  <span className="text-lg">{activePersona.avatar}</span>
                )}
                <h2 className="text-sm font-semibold text-white truncate">
                  {activePersona.name}
                </h2>
                {/* State badge (visible when face is collapsed) */}
                {faceCollapsed && voiceOutput.isSpeaking && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                    Speaking
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Stop Voice button */}
                {voiceOutput.isSpeaking && (
                  <button
                    onClick={voiceOutput.cancel}
                    className="px-2 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded transition-colors"
                    aria-label="Stop voice"
                  >
                    ■ Stop
                  </button>
                )}
                {/* Face collapse toggle */}
                <button
                  onClick={() => setFaceCollapsed(!faceCollapsed)}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors rounded"
                  aria-label={faceCollapsed ? 'Show avatar' : 'Hide avatar'}
                >
                  {faceCollapsed ? '▼' : '▲'}
                </button>
              </div>
            </div>

            {/* Avatar face band (collapsible) */}
            {!faceCollapsed && (
              <div className="border-b border-gray-800 bg-gray-900/50">
                <AvatarFace
                  amplitude={voiceOutput.currentAmplitude}
                  state={voiceOutput.avatarState}
                  personaName={activePersona.name}
                  styleId={(activePersona.avatarStyleId as AvatarStyleId) || undefined}
                  accentHue={activePersona.avatarAccentHue}
                  collapsed={faceCollapsed}
                />
                {/* Caption strip */}
                <div
                  className="h-8 flex items-center justify-center text-sm text-gray-300 truncate px-4"
                  style={{
                    opacity: voiceOutput.currentWord ? 1 : 0,
                    transition: 'opacity 200ms',
                  }}
                  aria-live="polite"
                >
                  {voiceOutput.currentWord}
                </div>
              </div>
            )}

            {/* Messages */}
            <ChatMessages messages={messages} isStreaming={isStreaming} />

            {/* Input */}
            <ChatInput
              personaName={activePersona.name}
              personaId={activePersonaId}
              isStreaming={isStreaming}
              onSend={(msg) => {
                voiceOutput.cancel(); // Interrupt speech on new message
                sendMessage(msg);
              }}
              disabled={isStreaming}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 text-sm">
                Select a persona to start chatting
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Confirmation Modal ── */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        labelledBy="confirm-modal-title"
        className="bg-gray-900 border border-gray-700 rounded-lg w-[380px] shadow-xl"
      >
        {confirmAction && (
          <>
            <div className="px-5 py-4">
              <h3 id="confirm-modal-title" className="text-base font-semibold text-white mb-2">
                {confirmAction.type === 'delete' ? 'Delete Persona' : 'Clear Chat History'}
              </h3>
              <p className="text-sm text-gray-400">
                {confirmAction.type === 'delete'
                  ? 'This will permanently delete this persona and all its chat history. This cannot be undone.'
                  : 'This will delete all messages for this persona. The persona itself will remain.'}
              </p>
            </div>
            <div className="px-5 py-3 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  confirmAction.type === 'delete'
                    ? handleDelete(confirmAction.id)
                    : handleClearHistory(confirmAction.id)
                }
                className={`px-4 py-2 text-sm text-white rounded transition-colors ${
                  confirmAction.type === 'delete'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {confirmAction.type === 'delete' ? 'Delete' : 'Clear'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Settings Panel ── */}
      {editingPersonaId && (
        <PersonaSettingsPanel
          personaId={editingPersonaId}
          onClose={() => setEditingPersonaId(null)}
          onSaved={loadPersonas}
        />
      )}
    </div>
  );
}
