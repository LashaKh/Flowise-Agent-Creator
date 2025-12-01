import type { ChatMessage as ChatMessageType } from '../types';

interface ChatMessageProps {
  message: ChatMessageType;
  onRetry?: () => void;
}

/**
 * Format timestamp to readable time string (e.g., "2:45 PM")
 */
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Streaming indicator with animated dots
 */
function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1 py-2">
      <span
        className="w-2 h-2 rounded-full bg-cosmic-cyan animate-pulse"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-cosmic-cyan animate-pulse"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-cosmic-cyan animate-pulse"
        style={{ animationDelay: '300ms' }}
      />
    </div>
  );
}

/**
 * Chat message bubble component
 * Displays user and assistant messages with cosmic theme styling
 */
export function ChatMessage({ message, onRetry }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const hasError = !!message.error;

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
    >
      <div
        className={`max-w-[90%] sm:max-w-[80%] md:max-w-[75%] ${
          isUser ? 'items-end' : 'items-start'
        } flex flex-col gap-1 sm:gap-2`}
      >
        {/* Message Bubble */}
        <div
          className={`px-3 py-2 sm:px-5 sm:py-3 font-body ${
            hasError
              ? 'glass border border-red-500/50 bg-red-500/10 rounded-2xl'
              : isUser
              ? 'bg-gradient-to-r from-cosmic-cyan/20 to-cosmic-purple/20 rounded-2xl rounded-br-sm'
              : 'glass rounded-2xl rounded-bl-sm'
          } transition-all`}
        >
          {/* Streaming Indicator */}
          {message.isStreaming ? (
            <StreamingIndicator />
          ) : (
            /* Message Content */
            <p className="text-white text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </p>
          )}

          {/* Error State */}
          {hasError && (
            <div className="mt-3 pt-3 border-t border-red-500/30 flex items-center justify-between gap-3">
              <p className="text-red-400 text-xs font-medium">
                {message.error}
              </p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-3 py-1.5 text-xs font-display font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 rounded-lg transition-all hover:scale-105 border border-red-500/50"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span
          className={`text-xs text-gray-500 font-body px-2 ${
            isUser ? 'text-right' : 'text-left'
          }`}
        >
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
