/**
 * useChat Hook
 *
 * Manages chat state and streaming communication with Flowise chatflows.
 * Provides message sending, streaming response handling, auto-retry logic,
 * and error recovery for the AI Persona Builder chat interface.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  sendMessage as flowiseSendMessage,
  parseStream,
  ChatError,
  getUserFriendlyError,
} from '../lib/flowise-chat';
import type { ChatMessage } from '../types';

// ============================================
// Constants
// ============================================

/**
 * Maximum number of auto-retry attempts for failed messages
 */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Base delay for exponential backoff (ms)
 * Delays: 1000ms, 2000ms, 4000ms
 */
const BASE_RETRY_DELAY = 1000;

// ============================================
// Hook Return Type
// ============================================

export interface UseChatReturn {
  /** Array of chat messages in chronological order */
  messages: ChatMessage[];

  /** True when waiting for assistant response */
  isLoading: boolean;

  /** Error message if last operation failed */
  error: string | null;

  /** Send a user message and receive streaming response */
  sendMessage: (content: string) => Promise<void>;

  /** Clear all messages (called on persona switch) */
  clearMessages: () => void;

  /** Retry the last failed message */
  retryLastMessage: () => Promise<void>;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Custom hook for managing chat interactions with a Flowise chatflow
 *
 * Features:
 * - Streaming message responses with real-time updates
 * - Automatic retry with exponential backoff (3 attempts)
 * - Manual retry for failed messages
 * - Auto-clear on chatflow change
 * - Type-safe error handling
 *
 * @param chatflowId - The Flowise chatflow ID to communicate with (null if no persona selected)
 * @returns Chat state and control functions
 *
 * @example
 * ```typescript
 * const { messages, isLoading, error, sendMessage, clearMessages } = useChat(persona?.chatflowId);
 *
 * const handleSend = async (text: string) => {
 *   await sendMessage(text);
 * };
 * ```
 */
export function useChat(chatflowId: string | null): UseChatReturn {
  // ============================================
  // State
  // ============================================

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  // Track retry attempts for current message
  const retryCountRef = useRef(0);

  // Track abort controller for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Session ID for conversation memory (persists until persona changes)
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // ============================================
  // Utility Functions
  // ============================================

  /**
   * Generate a unique ID for chat messages
   */
  const generateId = useCallback((): string => {
    return crypto.randomUUID();
  }, []);

  /**
   * Calculate exponential backoff delay based on retry attempt
   * @param attempt - Current retry attempt (0-indexed)
   * @returns Delay in milliseconds (1000ms, 2000ms, 4000ms)
   */
  const getRetryDelay = useCallback((attempt: number): number => {
    return BASE_RETRY_DELAY * Math.pow(2, attempt);
  }, []);

  /**
   * Wait for specified delay (used for retry backoff)
   */
  const delay = useCallback((ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }, []);

  // ============================================
  // Clear Messages
  // ============================================

  /**
   * Clear all messages from the conversation
   * Resets error state, retry tracking, and generates new sessionId
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setLastFailedMessage(null);
    retryCountRef.current = 0;

    // Generate new sessionId for fresh conversation
    sessionIdRef.current = crypto.randomUUID();

    // Cancel any in-flight requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsLoading(false);
  }, []);

  // ============================================
  // Send Message (with streaming and auto-retry)
  // ============================================

  /**
   * Internal function to send message with retry logic
   * @param content - User message content
   * @param isRetry - Whether this is a retry attempt
   */
  const sendMessageInternal = useCallback(
    async (content: string, isRetry = false): Promise<void> => {
      // Validation
      if (!chatflowId) {
        setError('No chatflow selected. Please select a persona.');
        return;
      }

      if (!content.trim()) {
        setError('Message cannot be empty.');
        return;
      }

      // Reset state for new message (but not for retries)
      if (!isRetry) {
        setError(null);
        setLastFailedMessage(null);
        retryCountRef.current = 0;
      }

      setIsLoading(true);

      // Create user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      // Add user message to chat (only if not a retry)
      if (!isRetry) {
        setMessages(prev => [...prev, userMessage]);
      }

      // Create placeholder assistant message for streaming
      const assistantMessageId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages(prev => [...prev, assistantMessage]);

      try {
        // Create abort controller for this request
        abortControllerRef.current = new AbortController();

        // Send message to Flowise with sessionId for memory
        const response = await flowiseSendMessage(chatflowId, content, sessionIdRef.current);

        // Stream the response
        let fullContent = '';

        for await (const chunk of parseStream(response)) {
          // Check if request was aborted
          if (abortControllerRef.current?.signal.aborted) {
            throw new ChatError('Request cancelled', 'NETWORK');
          }

          fullContent += chunk;

          // Update assistant message with new content
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: fullContent }
                : msg
            )
          );
        }

        // Mark streaming as complete
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, isStreaming: false }
              : msg
          )
        );

        // Success - reset retry tracking
        retryCountRef.current = 0;
        setLastFailedMessage(null);
        setError(null);
      } catch (err) {
        // Remove incomplete assistant message
        setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));

        // Get user-friendly error message
        const errorMessage = getUserFriendlyError(err);

        // Check if we should auto-retry
        const shouldRetry =
          err instanceof ChatError &&
          (err.code === 'NETWORK' || err.code === 'STREAM') &&
          retryCountRef.current < MAX_RETRY_ATTEMPTS;

        if (shouldRetry) {
          // Auto-retry with exponential backoff
          const delayMs = getRetryDelay(retryCountRef.current);
          retryCountRef.current += 1;

          console.log(
            `Retrying message (attempt ${retryCountRef.current}/${MAX_RETRY_ATTEMPTS}) after ${delayMs}ms...`
          );

          await delay(delayMs);

          // Recursive retry
          return sendMessageInternal(content, true);
        } else {
          // Max retries exhausted or non-retryable error
          setError(errorMessage);
          setLastFailedMessage(content);

          // Add error marker to last user message
          setMessages(prev =>
            prev.map((msg, idx) =>
              idx === prev.length - 1 && msg.role === 'user'
                ? { ...msg, error: errorMessage }
                : msg
            )
          );
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [chatflowId, generateId, getRetryDelay, delay]
  );

  /**
   * Send a user message to the chatflow
   * Handles streaming response and auto-retry on failure
   *
   * @param content - The message text to send
   */
  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      await sendMessageInternal(content, false);
    },
    [sendMessageInternal]
  );

  // ============================================
  // Retry Last Message
  // ============================================

  /**
   * Manually retry the last failed message
   * Resets retry counter to allow another 3 attempts
   */
  const retryLastMessage = useCallback(async (): Promise<void> => {
    if (!lastFailedMessage) {
      console.warn('No failed message to retry');
      return;
    }

    // Reset retry counter for manual retry
    retryCountRef.current = 0;

    await sendMessageInternal(lastFailedMessage, false);
  }, [lastFailedMessage, sendMessageInternal]);

  // ============================================
  // Effects
  // ============================================

  /**
   * Clear messages when chatflow changes (persona switch)
   */
  useEffect(() => {
    clearMessages();
  }, [chatflowId, clearMessages]);

  /**
   * Cleanup on unmount - cancel any in-flight requests
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ============================================
  // Return
  // ============================================

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    retryLastMessage,
  };
}
