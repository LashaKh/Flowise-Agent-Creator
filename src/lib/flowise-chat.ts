/**
 * Flowise Chat Client
 *
 * Provides a simplified interface for sending messages to Flowise chatflows
 * and handling streaming responses with proper error handling.
 */

import { env } from './env';
import {
  sendPrediction as contractSendPrediction,
  parseSSEStream as contractParseSSEStream,
} from '../../specs/001-ai-persona-builder/contracts/flowise-chatflow';

// Re-export types from contracts for convenience
export type {
  PredictionRequest,
  PredictionResponse,
  StreamEvent,
  ChatMessage,
} from '../../specs/001-ai-persona-builder/contracts/flowise-chatflow';

// ============================================
// Constants
// ============================================

/**
 * Flowise API base URL from environment config
 */
export const FLOWISE_API_URL = env.flowise.baseUrl;

// ============================================
// Error Handling
// ============================================

/**
 * Error codes for chat operations
 */
export type ChatErrorCode = 'NETWORK' | 'API' | 'STREAM';

/**
 * Typed error class for chat operations
 */
export class ChatError extends Error {
  code: ChatErrorCode;
  statusCode?: number;
  originalError?: unknown;

  constructor(
    message: string,
    code: ChatErrorCode,
    statusCode?: number,
    originalError?: unknown
  ) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

// ============================================
// Core Chat Functions
// ============================================

/**
 * Send a message to a Flowise chatflow with streaming enabled
 *
 * @param chatflowId - The Flowise chatflow ID to send the message to
 * @param message - The user's message/question
 * @returns Promise<Response> - The fetch Response object with streaming body
 * @throws {ChatError} - Typed error with code 'NETWORK' or 'API'
 *
 * @example
 * ```typescript
 * const response = await sendMessage('abc-123', 'Hello!');
 * for await (const chunk of parseStream(response)) {
 *   console.log(chunk); // Process each text chunk
 * }
 * ```
 */
export async function sendMessage(
  chatflowId: string,
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): Promise<Response> {
  if (!chatflowId) {
    throw new ChatError(
      'Chatflow ID is required',
      'API',
      400
    );
  }

  if (!message.trim()) {
    throw new ChatError(
      'Message cannot be empty',
      'API',
      400
    );
  }

  try {
    const response = await contractSendPrediction(chatflowId, message, true, sessionId, signal);

    // Check for HTTP errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new ChatError(
        `Flowise API error: ${errorText}`,
        'API',
        response.status
      );
    }

    // Validate response has a body
    if (!response.body) {
      throw new ChatError(
        'Response body is missing',
        'API',
        response.status
      );
    }

    return response;
  } catch (error) {
    // Re-throw if already a ChatError
    if (error instanceof ChatError) {
      throw error;
    }

    // Network or fetch errors
    throw new ChatError(
      error instanceof Error ? error.message : 'Network request failed',
      'NETWORK',
      undefined,
      error
    );
  }
}

/**
 * Parse SSE stream from Flowise response and yield text chunks
 *
 * @param response - The Response object from sendMessage()
 * @yields {string} - Text chunks as they arrive from the stream
 * @throws {ChatError} - Typed error with code 'STREAM'
 *
 * @example
 * ```typescript
 * try {
 *   const response = await sendMessage('abc-123', 'Hello!');
 *   for await (const chunk of parseStream(response)) {
 *     setMessages(prev => {
 *       const lastMessage = prev[prev.length - 1];
 *       if (lastMessage.role === 'assistant' && lastMessage.isStreaming) {
 *         lastMessage.content += chunk;
 *       }
 *       return [...prev];
 *     });
 *   }
 * } catch (error) {
 *   if (error instanceof ChatError) {
 *     console.error(`${error.code}: ${error.message}`);
 *   }
 * }
 * ```
 */
export async function* parseStream(
  response: Response
): AsyncGenerator<string, void, unknown> {
  try {
    // Check content type to determine how to parse
    const contentType = response.headers.get('content-type') || '';

    // If it's a JSON response (non-streaming), handle it directly
    if (contentType.includes('application/json')) {
      const json = await response.json();
      console.log('[Flowise] Non-streaming JSON response:', json);

      // Extract text from various possible response formats
      const text = json.text || json.response || json.answer || json.message || json.content || '';
      if (text) {
        yield text;
      }
      return;
    }

    // Otherwise, parse as SSE stream
    console.log('[Flowise] Parsing as SSE stream, content-type:', contentType);
    yield* contractParseSSEStream(response);
  } catch (error) {
    console.error('[Flowise] Stream parsing error:', error);
    throw new ChatError(
      error instanceof Error ? error.message : 'Stream parsing failed',
      'STREAM',
      undefined,
      error
    );
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if an error is a ChatError with specific code
 *
 * @param error - The error to check
 * @param code - Optional specific error code to match
 * @returns boolean
 *
 * @example
 * ```typescript
 * catch (error) {
 *   if (isChatError(error, 'NETWORK')) {
 *     toast.error('Network connection failed. Please try again.');
 *   }
 * }
 * ```
 */
export function isChatError(error: unknown, code?: ChatErrorCode): boolean {
  if (!(error instanceof ChatError)) {
    return false;
  }
  return code ? error.code === code : true;
}

/**
 * Get a user-friendly error message from a ChatError
 *
 * @param error - The error to format
 * @returns string - User-friendly error message
 *
 * @example
 * ```typescript
 * catch (error) {
 *   const message = getUserFriendlyError(error);
 *   toast.error(message);
 * }
 * ```
 */
export function getUserFriendlyError(error: unknown): string {
  if (!(error instanceof ChatError)) {
    return 'An unexpected error occurred';
  }

  switch (error.code) {
    case 'NETWORK':
      return 'Network connection failed. Please check your internet and try again.';
    case 'API':
      if (error.statusCode === 404) {
        return 'Chatflow not found. Please check the persona configuration.';
      }
      if (error.statusCode === 429) {
        return 'Rate limit exceeded. Please wait a moment and try again.';
      }
      if (error.statusCode && error.statusCode >= 500) {
        return 'Server error. Please try again later.';
      }
      return 'API error occurred. Please try again.';
    case 'STREAM':
      return 'Stream interrupted. The response may be incomplete.';
    default:
      return 'An error occurred. Please try again.';
  }
}
