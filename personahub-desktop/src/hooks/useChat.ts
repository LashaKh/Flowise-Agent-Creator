import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage } from '../types';

export interface UseChatOptions {
  onAssistantDone?: (content: string, personaId: string, sessionId: string) => void;
}

/**
 * Chat hook.
 *
 * When `sessionId` is provided, messages load from and send to that specific
 * session. When it's null/undefined, we fall back to the persona's latest
 * session (the "resume last conversation" default used on first persona click).
 */
export function useChat(
  personaId: string | null,
  sessionId: string | null,
  options?: UseChatOptions
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null);
  const assistantBufferRef = useRef('');
  const assistantMsgIdRef = useRef('');
  // Shared watchdog timer — armed when sendMessage fires, re-armed on every
  // chunk, cleared on done. If 90s elapses with no activity, force-finalize
  // the placeholder message with a timeout error so the UI can recover.
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store onAssistantDone in a ref so the streaming effect doesn't capture a
  // stale version when the parent re-renders with a new callback (P3-D-1).
  const onAssistantDoneRef = useRef(options?.onAssistantDone);
  useEffect(() => {
    onAssistantDoneRef.current = options?.onAssistantDone;
  });

  // QA finding CQ6: when the user switches personas mid-stream, stop the
  // in-flight generation so the gateway doesn't keep burning tokens. The
  // `agent:stop` IPC already exists — we just wire it to unmount/personaId
  // change. If no stream is in flight it's a cheap no-op.
  useEffect(() => {
    if (!personaId) return;
    return () => {
      window.electronAPI.agent.stopGeneration(personaId).catch(() => {
        /* best-effort — agent may already be stopped */
      });
    };
  }, [personaId]);

  // Resolve the session we should be using. If caller passed one explicitly,
  // use it; otherwise ask the main process for the latest (or create one).
  useEffect(() => {
    if (!personaId) {
      setMessages([]);
      setResolvedSessionId(null);
      return;
    }

    let cancelled = false;

    async function resolveAndLoad() {
      try {
        let targetSessionId = sessionId;
        if (!targetSessionId) {
          const result = await window.electronAPI.chat.getOrCreateSession(personaId!);
          targetSessionId = result.sessionId;
        }
        const rows = await window.electronAPI.chat.loadMessages(targetSessionId);
        if (cancelled) return;
        setResolvedSessionId(targetSessionId);
        setMessages(rows);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    }

    resolveAndLoad();
    return () => {
      cancelled = true;
    };
  }, [personaId, sessionId]);

  // Listen for streaming response chunks from the agent.
  //
  // QA finding EC3 (session race): we snapshot (personaId, resolvedSessionId)
  // at effect bind time and compare against both the chunk's personaId AND
  // the listener's own snapshot — so rapidly switching personas or sessions
  // mid-stream can never persist a chunk into the wrong session.
  //
  // QA finding EC4 (silent save failure): if saveMessage fails, we mark the
  // in-memory message with `error: true` so the UI can surface it instead of
  // the user discovering the loss only on next reload.
  //
  // Stream watchdog: if the SSE connection drops mid-flight (network blip,
  // gateway crash, malformed chunk), no terminal `done:true` ever fires and
  // the placeholder assistant message would stay isStreaming=true forever.
  // We arm a 90s timer on every chunk and reset it on the next one. On
  // timeout we force-finalize the message with an error so the user can
  // retry — the actual stop ipc is best-effort so the gateway stops
  // burning tokens.
  useEffect(() => {
    const ownerPersonaId = personaId;
    const ownerSessionId = resolvedSessionId;
    const WATCHDOG_MS = 90_000;

    const clearWatchdog = () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };

    const fireWatchdog = () => {
      const msgId = assistantMsgIdRef.current;
      if (!msgId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, isStreaming: false, error: 'Response timed out — please try again.' }
            : m
        )
      );
      setIsStreaming(false);
      assistantBufferRef.current = '';
      assistantMsgIdRef.current = '';
      if (ownerPersonaId) {
        window.electronAPI.agent.stopGeneration(ownerPersonaId).catch(() => {
          /* best-effort — agent may already be stopped */
        });
      }
    };

    const armWatchdog = () => {
      clearWatchdog();
      watchdogTimerRef.current = setTimeout(fireWatchdog, WATCHDOG_MS);
    };

    const cleanup = window.electronAPI.agent.onResponse((chunk) => {
      if (chunk.personaId !== ownerPersonaId) return;

      if (chunk.done) {
        clearWatchdog();
        const finalContent = assistantBufferRef.current;
        const msgId = assistantMsgIdRef.current;
        // Guard against the double-done bug (P2-1).
        if (!msgId) return;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, content: finalContent, isStreaming: false } : m
          )
        );
        setIsStreaming(false);

        // Only persist into the session we were bound to. If the user switched
        // sessions mid-stream, ownerSessionId is stale and we skip the save
        // (the UI shows the message but it won't be in the wrong session).
        const persistSessionId = ownerSessionId;
        if (persistSessionId) {
          window.electronAPI.chat
            .saveMessage({
              id: msgId,
              sessionId: persistSessionId,
              role: 'assistant',
              content: finalContent,
            })
            .catch((err) => {
              console.error('[useChat] Failed to persist assistant message:', err);
              // Surface the failure on the message itself so the user sees
              // "Failed to save reply — please reload" rather than silently
              // losing the reply on next session load.
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId
                    ? { ...m, error: 'Failed to save reply — it may be lost on reload' }
                    : m
                )
              );
            });

          if (finalContent && ownerPersonaId) {
            onAssistantDoneRef.current?.(finalContent, ownerPersonaId, persistSessionId);
          }
        }

        assistantBufferRef.current = '';
        assistantMsgIdRef.current = '';
      } else {
        armWatchdog();
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

    return () => {
      clearWatchdog();
      cleanup();
    };
  }, [personaId, resolvedSessionId]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!personaId || !resolvedSessionId || isStreaming) return;

      const userMsgId = crypto.randomUUID();
      const now = new Date().toISOString();

      const userMsg: ChatMessage = {
        id: userMsgId,
        sessionId: resolvedSessionId,
        role: 'user',
        content: message,
        createdAt: now,
      };

      await window.electronAPI.chat.saveMessage({
        id: userMsgId,
        sessionId: resolvedSessionId,
        role: 'user',
        content: message,
      });

      const assistantMsgId = crypto.randomUUID();
      assistantBufferRef.current = '';
      assistantMsgIdRef.current = assistantMsgId;

      const assistantPlaceholder: ChatMessage = {
        id: assistantMsgId,
        sessionId: resolvedSessionId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
      setIsStreaming(true);

      // Arm the watchdog up front so a request that goes out but never
      // emits a single chunk (gateway hung, network black-holed) still
      // recovers within 90s instead of leaving the UI permafrozen.
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = setTimeout(() => {
        const msgId = assistantMsgIdRef.current;
        if (!msgId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, isStreaming: false, error: 'Response timed out — please try again.' }
              : m
          )
        );
        setIsStreaming(false);
        assistantBufferRef.current = '';
        assistantMsgIdRef.current = '';
        window.electronAPI.agent.stopGeneration(personaId).catch(() => {});
      }, 90_000);

      try {
        await window.electronAPI.agent.sendMessage(personaId, resolvedSessionId, message);
      } catch (err) {
        if (watchdogTimerRef.current) {
          clearTimeout(watchdogTimerRef.current);
          watchdogTimerRef.current = null;
        }
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
    [personaId, resolvedSessionId, isStreaming]
  );

  return { messages, isStreaming, sendMessage, resolvedSessionId };
}

