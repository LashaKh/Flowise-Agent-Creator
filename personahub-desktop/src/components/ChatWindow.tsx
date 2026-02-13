import { useState, useEffect } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import { useChat } from '../hooks/useChat';

interface SidebarPersona {
  id: string;
  name: string;
  lastMessage?: string;
  unread: boolean;
}

export default function ChatWindow() {
  const [activePersonaId, setActivePersonaId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<SidebarPersona[]>([]);
  const { messages, isStreaming, sendMessage } = useChat(activePersonaId);

  // Load active personas from the local database on mount
  useEffect(() => {
    async function loadPersonas() {
      try {
        const rows = (await window.electronAPI.db.all(
          `SELECT id, name FROM personas WHERE status = 'active' ORDER BY name ASC`,
          []
        )) as Array<{ id: string; name: string }>;

        // For each persona, grab the last message if any
        const withLastMsg: SidebarPersona[] = await Promise.all(
          rows.map(async (row) => {
            const lastMsg = (await window.electronAPI.db.get(
              `SELECT cm.content FROM chat_messages cm
               JOIN chat_sessions cs ON cm.session_id = cs.session_id
               WHERE cs.persona_id = ? ORDER BY cm.created_at DESC LIMIT 1`,
              [row.id]
            )) as { content: string } | undefined;

            return {
              id: row.id,
              name: row.name,
              lastMessage: lastMsg?.content,
              unread: false,
            };
          })
        );

        setPersonas(withLastMsg);
      } catch (err) {
        console.error('Failed to load personas:', err);
      }
    }

    loadPersonas();
  }, []);

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

  const activePersona = personas.find((p) => p.id === activePersonaId);

  return (
    <div className="flex h-full">
      <ChatSidebar
        personas={personas}
        activePersonaId={activePersonaId}
        onSelectPersona={setActivePersonaId}
      />

      <div className="flex-1 flex flex-col">
        {activePersona ? (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-800 flex items-center">
              <h2 className="text-sm font-semibold text-white">
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
    </div>
  );
}
