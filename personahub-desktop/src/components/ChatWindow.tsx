import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import ChatSidebar from './ChatSidebar';
import Modal from './Modal';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import PersonaSettingsPanel from './PersonaSettingsPanel';
import AvatarFace from './AvatarFace';
import { useChat } from '../hooks/useChat';
import { useVoiceOutput } from '../hooks/useVoiceOutput';
import type { GlobalVoicePrefs, AvatarStyleId, VoiceProvider, ChatSession } from '../types';

/** Format a session's display title, falling back to a date stamp. */
function sessionTitle(s: ChatSession): string {
  if (s.title) return s.title;
  const d = new Date(s.updatedAt || s.createdAt);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `New chat · ${date}, ${time}`;
}

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
  // Per-persona voice overrides — read from settings JSON so switching
  // personas (or saving new voice settings) reconfigures the active TTS
  // router. Falls back to global voice prefs when undefined.
  voiceEnabled?: boolean;
  voiceProvider?: VoiceProvider;
  voiceId?: string;
  voiceSpeed?: number;
  personaMemory?: string;
}

export default function ChatWindow() {
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<SidebarPersona[]>([]);
  const [faceCollapsed, setFaceCollapsed] = useState(false);
  const [sessionList, setSessionList] = useState<ChatSession[]>([]);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  // Bumped whenever this persona's session list needs to be refetched
  // (after creating/renaming/deleting a session).
  const [sessionRefresh, setSessionRefresh] = useState(0);

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

    // Live-apply Settings changes without waiting for a view re-mount.
    const onPrefsChanged = (e: Event) => {
      const detail = (e as CustomEvent<GlobalVoicePrefs>).detail;
      if (detail) setVoicePrefs(detail);
    };
    window.addEventListener('voice-prefs-changed', onPrefsChanged);
    return () => window.removeEventListener('voice-prefs-changed', onPrefsChanged);
  }, []);

  // Voice output hook — per-persona overrides take precedence over global prefs.
  // useVoiceOutput keys its router-recreate effect on these props, so changing
  // persona or saving new voice settings tears down the stale TTS router and
  // builds a fresh one on the next render. Without this, every persona spoke
  // with the global default voice forever.
  const activePersona = useMemo(
    () => personas.find((p) => p.id === activePersonaId),
    [personas, activePersonaId],
  );
  // Global "local-only mode" overrides every provider choice so the router
  // never attempts cloud synthesis, even if the persona explicitly picked
  // a cloud-* provider. Previously this toggle was decorative.
  const resolvedProvider = voicePrefs?.localOnlyMode
    ? 'local-only'
    : (activePersona?.voiceProvider ?? voicePrefs?.defaultProvider ?? 'os-native');

  const voiceOutput = useVoiceOutput({
    personaId: activePersonaId,
    voiceEnabled: activePersona?.voiceEnabled ?? voicePrefs?.voiceOutputEnabled ?? true,
    voiceProvider: resolvedProvider,
    voiceId: activePersona?.voiceId ?? voicePrefs?.defaultVoiceId,
    voiceSpeed: activePersona?.voiceSpeed ?? voicePrefs?.defaultSpeed,
  });

  // When activeSessionId is null, useChat resolves to the persona's latest
  // session (the "resume last conversation" default). When set, it loads
  // that specific session.
  const { messages, isStreaming, sendMessage, resolvedSessionId } = useChat(
    activePersonaId,
    activeSessionId,
    { onAssistantDone: voiceOutput.handleAssistantDone }
  );

  // Reset session when persona changes so we resume the new persona's latest.
  useEffect(() => {
    setActiveSessionId(null);
    setSessionMenuOpen(false);
  }, [activePersonaId]);

  // Load the session list for the header dropdown + live-refresh when the
  // session we're resolved into changes or a new message arrives.
  useEffect(() => {
    if (!activePersonaId) {
      setSessionList([]);
      return;
    }
    let cancelled = false;
    window.electronAPI.chat
      .listSessions(activePersonaId)
      .then((rows) => {
        if (!cancelled) setSessionList(rows);
      })
      .catch((err) => console.warn('[ChatWindow] listSessions failed:', err));
    return () => {
      cancelled = true;
    };
    // Intentionally no `messages.length` dependency — the session list only
    // changes when a new session is created or the resolved session switches.
    // Refiring on every message caused an unnecessary IPC round-trip per chunk.
  }, [activePersonaId, sessionRefresh, resolvedSessionId]);

  // New-session handler: create server-side, switch to it, refresh the list.
  const handleNewSession = useCallback(async () => {
    if (!activePersonaId) return;
    try {
      const { sessionId } = await window.electronAPI.chat.createSession(activePersonaId);
      setActiveSessionId(sessionId);
      setSessionRefresh((n) => n + 1);
      setSessionMenuOpen(false);
    } catch (err) {
      console.error('Failed to create new session:', err);
      toast.error('Could not start a new chat');
    }
  }, [activePersonaId]);

  // Auto-title a brand-new session after its first user↔assistant exchange.
  // Fires exactly once per session: when messages has exactly 2 entries
  // (user + assistant), streaming has stopped, and the session has no title.
  const autoTitledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!resolvedSessionId || isStreaming) return;
    if (autoTitledRef.current.has(resolvedSessionId)) return;
    if (messages.length !== 2) return;
    const [userMsg, assistantMsg] = messages;
    if (userMsg?.role !== 'user' || assistantMsg?.role !== 'assistant') return;
    if (!assistantMsg.content || assistantMsg.isStreaming) return;
    const existing = sessionList.find((s) => s.id === resolvedSessionId);
    if (existing?.title) return;

    autoTitledRef.current.add(resolvedSessionId);
    window.electronAPI.chat
      .autoTitle(resolvedSessionId, userMsg.content, assistantMsg.content)
      .then((res) => {
        if (res?.title) setSessionRefresh((n) => n + 1);
      })
      .catch((err) => console.warn('[ChatWindow] autoTitle failed:', err));
  }, [messages, isStreaming, resolvedSessionId, sessionList]);

  // ⌘N / Ctrl+N — new session within the active persona.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'n') {
        if (activePersonaId) {
          e.preventDefault();
          handleNewSession();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePersonaId, handleNewSession]);

  // Close the session dropdown on outside click / Escape.
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sessionMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target as Node)) {
        setSessionMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSessionMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [sessionMenuOpen]);

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

          let settings: {
            avatar?: string; pinned?: boolean;
            avatarStyleId?: string; avatarAccentHue?: number;
            voiceEnabled?: boolean; voiceProvider?: VoiceProvider;
            voiceId?: string; voiceSpeed?: number;
            personaMemory?: string;
          } = {};
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
            voiceEnabled: settings.voiceEnabled,
            voiceProvider: settings.voiceProvider,
            voiceId: settings.voiceId,
            voiceSpeed: settings.voiceSpeed,
            personaMemory: settings.personaMemory,
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

  // Load on mount, and reload when a persona is edited so avatar/voice apply live.
  useEffect(() => {
    loadPersonas();
    const onPersonaUpdated = () => loadPersonas();
    window.addEventListener('persona-updated', onPersonaUpdated);
    return () => window.removeEventListener('persona-updated', onPersonaUpdated);
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
      await loadPersonas();
      // If this is the active persona, selecting it again will reload messages
      if (activePersonaId === id) {
        setActiveSessionId(null);
        setActivePersonaId(null);
        setTimeout(() => setActivePersonaId(id), 0);
      }
      setSessionRefresh((n) => n + 1);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
    setConfirmAction(null);
  }

  // Handlers passed to the sidebar for session-level operations.
  const handleSelectSession = useCallback((personaId: string, sessionId: string) => {
    setActivePersonaId(personaId);
    setActiveSessionId(sessionId);
  }, []);

  const handleRenameSession = useCallback(async (sessionId: string, title: string) => {
    try {
      await window.electronAPI.chat.renameSession(sessionId, title);
      setSessionRefresh((n) => n + 1);
    } catch (err) {
      console.error('Failed to rename session:', err);
      toast.error('Could not rename chat');
    }
  }, []);

  // Sessions pending deletion — hidden from the UI for 5s before the real
  // DB delete fires, giving the user a chance to undo.
  const pendingDeletesRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());

  const handleDeleteSession = useCallback((sessionId: string) => {
    // If already pending, ignore a second click.
    if (pendingDeletesRef.current.has(sessionId)) return;

    // Optimistic: hide immediately so the user sees a response.
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    if (activeSessionId === sessionId) setActiveSessionId(null);

    const timer = setTimeout(async () => {
      pendingDeletesRef.current.delete(sessionId);
      try {
        await window.electronAPI.chat.deleteSession(sessionId);
      } catch (err) {
        console.error('Failed to delete session:', err);
      } finally {
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
        setSessionRefresh((n) => n + 1);
      }
    }, 5000);
    pendingDeletesRef.current.set(sessionId, timer);

    toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} bg-gray-800 border border-gray-700 rounded-lg shadow-xl px-4 py-3 flex items-center gap-3`}>
        <span className="text-sm text-gray-200">Chat deleted</span>
        <button
          onClick={() => {
            const pending = pendingDeletesRef.current.get(sessionId);
            if (pending) {
              clearTimeout(pending);
              pendingDeletesRef.current.delete(sessionId);
            }
            setPendingDeleteIds((prev) => {
              const next = new Set(prev);
              next.delete(sessionId);
              return next;
            });
            toast.dismiss(t.id);
          }}
          className="text-xs text-indigo-300 hover:text-indigo-200 font-medium"
        >
          Undo
        </button>
      </div>
    ), { duration: 5000 });
  }, [activeSessionId]);

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

  return (
    <div className="flex h-full">
      <ChatSidebar
        personas={personas}
        activePersonaId={activePersonaId}
        activeSessionId={activeSessionId}
        sessionRefreshKey={sessionRefresh}
        hiddenSessionIds={pendingDeleteIds}
        onSelectPersona={(id) => {
          setActivePersonaId(id);
          setActiveSessionId(null);
        }}
        onSelectSession={handleSelectSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
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
            {/* Header — persona + current session */}
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {activePersona.avatar && (
                  <span className="text-lg">{activePersona.avatar}</span>
                )}
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white truncate">
                      {activePersona.name}
                    </h2>
                    {faceCollapsed && voiceOutput.isSpeaking && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                        Speaking
                      </span>
                    )}
                  </div>
                  {/* Session switcher */}
                  <div className="relative" ref={sessionMenuRef}>
                    <button
                      onClick={() => setSessionMenuOpen((v) => !v)}
                      className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors max-w-[280px] truncate"
                      title="Switch chat"
                    >
                      <span className="truncate">
                        {(() => {
                          const current = sessionList.find((s) => s.id === resolvedSessionId);
                          return current ? sessionTitle(current) : 'Loading…';
                        })()}
                      </span>
                      <span className="text-[9px] leading-none">▾</span>
                    </button>
                    {sessionMenuOpen && (
                      <div className="absolute z-30 left-0 mt-1 w-72 max-h-80 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1">
                        <button
                          onClick={handleNewSession}
                          className="w-full text-left px-3 py-2 text-sm text-indigo-300 hover:bg-gray-700 flex items-center gap-2"
                        >
                          <span className="text-base leading-none">+</span>
                          <span>New chat</span>
                          <span className="ml-auto text-[10px] text-gray-500">⌘N</span>
                        </button>
                        <div className="border-t border-gray-700 my-1" />
                        {sessionList.length === 0 && (
                          <div className="px-3 py-2 text-xs text-gray-500">No chats yet</div>
                        )}
                        {sessionList.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              setActiveSessionId(s.id);
                              setSessionMenuOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm truncate transition-colors ${
                              s.id === resolvedSessionId
                                ? 'bg-indigo-600/20 text-white'
                                : 'text-gray-300 hover:bg-gray-700'
                            }`}
                          >
                            {sessionTitle(s)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* New chat (always visible) */}
                <button
                  onClick={handleNewSession}
                  className="px-2 py-1 text-xs text-gray-300 hover:text-white hover:bg-gray-800 rounded transition-colors flex items-center gap-1"
                  aria-label="New chat"
                  title="New chat (⌘N)"
                >
                  <span className="text-sm leading-none">+</span>
                  <span>New</span>
                </button>
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

            {/* Avatar face band (collapsible + globally gated).
                `voicePrefs.featureFlag` is the "Animated Avatar Face" master
                toggle in Settings. Previously this did nothing — the band
                rendered regardless. */}
            {!faceCollapsed && voicePrefs?.featureFlag !== false && (
              <div className="border-b border-gray-800 bg-gray-900/50">
                <AvatarFace
                  amplitude={voiceOutput.currentAmplitude}
                  state={voiceOutput.avatarState}
                  personaName={activePersona.name}
                  styleId={(activePersona.avatarStyleId as AvatarStyleId) || undefined}
                  accentHue={activePersona.avatarAccentHue}
                  collapsed={faceCollapsed}
                />
                {/* Caption strip — gated by the global Captions toggle. */}
                {voicePrefs?.captionsEnabled !== false && (
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
                )}
              </div>
            )}

            {/* Memory indicator — shown at the top of an empty session */}
            {messages.length === 0 && (
              <div className="px-4 pt-3 text-[11px] italic text-gray-500 text-center">
                {activePersona.personaMemory?.trim()
                  ? `New chat · ${activePersona.name} remembers your persona memory`
                  : `New chat · starting fresh`}
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
