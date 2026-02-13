import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage } from '../types';

export function useChat(personaId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const assistantBufferRef = useRef('');
  const assistantMsgIdRef = useRef('');

  // Load messages from DB when persona changes
  useEffect(() => {
    if (!personaId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      try {
        // Get or create a session for this persona
        const session = await getOrCreateSession(personaId!);

        // Load existing messages
        const rows = (await window.electronAPI.db.all(
          'SELECT id, session_id, role, content, error, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
          [session.sessionId]
        )) as Array<{
          id: string;
          session_id: string;
          role: 'user' | 'assistant';
          content: string;
          error: string | null;
          created_at: string;
        }>;

        if (!cancelled) {
          setMessages(
            rows.map((r) => ({
              id: r.id,
              sessionId: r.session_id,
              role: r.role,
              content: r.content,
              error: r.error ?? undefined,
              createdAt: r.created_at,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    }

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [personaId]);

  // Listen for streaming response chunks from the agent
  useEffect(() => {
    const cleanup = window.electronAPI.agent.onResponse((chunk) => {
      if (chunk.personaId !== personaId) return;

      if (chunk.done) {
        // Streaming finished -- save the complete assistant message to DB
        const finalContent = assistantBufferRef.current;
        const msgId = assistantMsgIdRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, content: finalContent, isStreaming: false } : m
          )
        );
        setIsStreaming(false);

        // Persist to DB
        getOrCreateSession(personaId!).then((session) => {
          window.electronAPI.db.run(
            'INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
            [msgId, session.sessionId, 'assistant', finalContent, new Date().toISOString()]
          );
        });

        assistantBufferRef.current = '';
        assistantMsgIdRef.current = '';
      } else {
        // Append chunk to buffer and update the streaming message
        assistantBufferRef.current += chunk.content;
        const currentContent = assistantBufferRef.current;
        const msgId = assistantMsgIdRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, content: currentContent } : m
          )
        );
      }
    });

    return cleanup as unknown as () => void;
  }, [personaId]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!personaId || isStreaming) return;

      const session = await getOrCreateSession(personaId);
      const userMsgId = crypto.randomUUID();
      const now = new Date().toISOString();

      // Create user message
      const userMsg: ChatMessage = {
        id: userMsgId,
        sessionId: session.sessionId,
        role: 'user',
        content: message,
        createdAt: now,
      };

      // Save user message to DB
      await window.electronAPI.db.run(
        'INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
        [userMsgId, session.sessionId, 'user', message, now]
      );

      // Create placeholder assistant message for streaming
      const assistantMsgId = crypto.randomUUID();
      assistantBufferRef.current = '';
      assistantMsgIdRef.current = assistantMsgId;

      const assistantPlaceholder: ChatMessage = {
        id: assistantMsgId,
        sessionId: session.sessionId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
      setIsStreaming(true);

      // Send to agent via Electron IPC
      try {
        await window.electronAPI.agent.sendMessage(personaId, message);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: '', isStreaming: false, error: errorMsg }
              : m
          )
        );
        setIsStreaming(false);
      }
    },
    [personaId, isStreaming]
  );

  return { messages, isStreaming, sendMessage };
}

// Session cache to avoid repeated DB lookups within the same render cycle
const sessionCache = new Map<string, { sessionId: string }>();

async function getOrCreateSession(personaId: string): Promise<{ sessionId: string }> {
  const cached = sessionCache.get(personaId);
  if (cached) return cached;

  const existing = (await window.electronAPI.db.get(
    'SELECT id, session_id FROM chat_sessions WHERE persona_id = ? ORDER BY created_at DESC LIMIT 1',
    [personaId]
  )) as { id: string; session_id: string } | undefined;

  if (existing) {
    const result = { sessionId: existing.session_id };
    sessionCache.set(personaId, result);
    return result;
  }

  // Create a new session
  const sessionId = crypto.randomUUID();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await window.electronAPI.db.run(
    'INSERT INTO chat_sessions (id, persona_id, session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, personaId, sessionId, now, now]
  );

  const result = { sessionId };
  sessionCache.set(personaId, result);
  return result;
}
