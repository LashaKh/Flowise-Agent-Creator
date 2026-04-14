import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage } from '../types';

export interface UseChatOptions {
  onAssistantDone?: (content: string, personaId: string) => void;
}

export function useChat(personaId: string | null, options?: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const assistantBufferRef = useRef('');
  const assistantMsgIdRef = useRef('');

  // Store onAssistantDone in a ref so the streaming effect below doesn't
  // capture a stale version when the parent re-renders with a new callback
  // (audit finding P3-D-1).
  const onAssistantDoneRef = useRef(options?.onAssistantDone);
  useEffect(() => {
    onAssistantDoneRef.current = options?.onAssistantDone;
  });

  // Load messages from DB when persona changes
  useEffect(() => {
    if (!personaId) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function loadMessages() {
      try {
        const session = await getOrCreateSession(personaId!);
        const rows = await window.electronAPI.chat.loadMessages(session.sessionId);
        if (!cancelled) setMessages(rows);
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
        // Streaming finished -- save the complete assistant message to DB.
        // Guard against the double-done bug (audit finding P2-1): if the
        // buffer and id are both already empty, a previous `done` already
        // processed this stream and we're just the trailing `end` event.
        const finalContent = assistantBufferRef.current;
        const msgId = assistantMsgIdRef.current;
        if (!msgId) return;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, content: finalContent, isStreaming: false } : m
          )
        );
        setIsStreaming(false);

        // Persist to DB via the typed chat API with error logging
        // (audit findings P1-2, P4-B-2).
        getOrCreateSession(personaId!)
          .then((session) =>
            window.electronAPI.chat.saveMessage({
              id: msgId,
              sessionId: session.sessionId,
              role: 'assistant',
              content: finalContent,
            })
          )
          .catch((err) => console.error('[useChat] Failed to persist assistant message:', err));

        // Notify voice output that a reply is ready (via ref — not stale)
        if (finalContent && personaId) {
          onAssistantDoneRef.current?.(finalContent, personaId);
        }

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

    return cleanup;
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

      // Save user message to DB via typed chat API
      await window.electronAPI.chat.saveMessage({
        id: userMsgId,
        sessionId: session.sessionId,
        role: 'user',
        content: message,
      });

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

/** Clear the session cache for a persona (called after clearing chat history). */
export function clearSessionCache(personaId: string) {
  sessionCache.delete(personaId);
}

/**
 * Clear the entire session cache. Call this on sign-out or other lifecycle
 * events where stale session mappings could leak across users.
 * Audit finding P4-E-4.
 */
export function clearAllSessionCache() {
  sessionCache.clear();
}

async function getOrCreateSession(personaId: string): Promise<{ sessionId: string }> {
  const cached = sessionCache.get(personaId);
  if (cached) return cached;

  // The typed IPC handler returns or creates a session atomically.
  const result = await window.electronAPI.chat.getOrCreateSession(personaId);
  sessionCache.set(personaId, result);
  return result;
}
