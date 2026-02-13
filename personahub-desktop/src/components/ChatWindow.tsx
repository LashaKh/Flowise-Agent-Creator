import { useState, useEffect, useCallback } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import PersonaSettingsPanel from './PersonaSettingsPanel';
import { useChat, clearSessionCache } from '../hooks/useChat';

interface SidebarPersona {
  id: string;
  name: string;
  lastMessage?: string;
  unread: boolean;
  avatar?: string;
  pinned?: boolean;
  messageCount?: number;
  lastActiveAt?: string | null;
}

export default function ChatWindow() {
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<SidebarPersona[]>([]);
  const { messages, isStreaming, sendMessage } = useChat(activePersonaId);

  // Modal states
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'clearHistory'; id: string } | null>(null);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);

  // Load active personas from the local database with stats
  const loadPersonas = useCallback(async () => {
    try {
      const rows = (await window.electronAPI.db.all(
        `SELECT id, name, settings FROM persona_configs WHERE status = 'active' ORDER BY name ASC`,
        []
      )) as Array<{ id: string; name: string; settings: string | null }>;

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
            const lastMsg = (await window.electronAPI.db.get(
              `SELECT cm.content FROM chat_messages cm
               JOIN chat_sessions cs ON cm.session_id = cs.id
               WHERE cs.persona_id = ? ORDER BY cm.created_at DESC LIMIT 1`,
              [row.id]
            )) as { content: string } | undefined;
            lastMessage = lastMsg?.content;
          } catch { /* optional */ }

          let settings: { avatar?: string; pinned?: boolean } = {};
          try { if (row.settings) settings = JSON.parse(row.settings); } catch { /* empty */ }

          return {
            id: row.id,
            name: row.name,
            lastMessage,
            unread: false,
            avatar: settings.avatar,
            pinned: settings.pinned,
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
      alert('Persona exported to clipboard');
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
      alert('Failed to import: ' + (err instanceof Error ? err.message : 'Invalid file'));
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
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center">
              <h2 className="text-sm font-semibold text-white">
                {activePersona.avatar && (
                  <span className="mr-2">{activePersona.avatar}</span>
                )}
                {activePersona.name}
              </h2>
            </div>

            {/* Messages */}
            <ChatMessages messages={messages} isStreaming={isStreaming} />

            {/* Input */}
            <ChatInput
              personaName={activePersona.name}
              onSend={sendMessage}
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
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-lg w-[380px] shadow-xl">
            <div className="px-5 py-4">
              <h3 className="text-base font-semibold text-white mb-2">
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
          </div>
        </div>
      )}

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
