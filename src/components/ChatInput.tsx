import { useState, useRef, useEffect, type KeyboardEvent, type FormEvent, type ChangeEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

/**
 * ChatInput Component
 *
 * A textarea-based chat input with auto-resize, keyboard shortcuts, and loading states.
 *
 * Features:
 * - Auto-resize textarea as user types
 * - Enter to send, Shift+Enter for newline
 * - Disabled state when loading or explicitly disabled
 * - Loading spinner in send button
 * - Cosmic theme styling with glass morphism
 */
export function ChatInput({ onSend, disabled = false, isLoading = false }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Set height based on scrollHeight, with a max height
    const maxHeight = 200; // ~8-10 lines
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [message]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter without Shift sends the message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    // Shift+Enter adds a newline (default behavior)
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const trimmedMessage = message.trim();
    if (!trimmedMessage || disabled || isLoading) {
      return;
    }

    onSend(trimmedMessage);
    setMessage('');

    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const isDisabled = disabled || isLoading;
  const canSend = message.trim().length > 0 && !isDisabled;

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="glass-strong rounded-xl sm:rounded-2xl p-2 sm:p-3 border border-white/20 focus-within:border-cosmic-cyan/50 transition-colors">
        <div className="flex items-end gap-2 sm:gap-3">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={isDisabled}
            rows={1}
            className="
              flex-1 bg-transparent resize-none outline-none
              text-white placeholder-gray-500 font-body
              disabled:opacity-50 disabled:cursor-not-allowed
              max-h-[200px] overflow-y-auto scrollbar-thin
              py-2 px-2
            "
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!canSend}
            className={`
              btn-cosmic rounded-lg sm:rounded-xl px-3 sm:px-4 py-2
              flex items-center justify-center gap-1 sm:gap-2
              min-w-[70px] sm:min-w-[100px] transition-all
              ${!canSend
                ? 'opacity-50 cursor-not-allowed hover:transform-none hover:shadow-none'
                : 'hover:scale-[1.02]'
              }
            `}
          >
            {isLoading ? (
              <>
                {/* Loading Spinner */}
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="font-display font-semibold hidden sm:inline">Sending</span>
              </>
            ) : (
              <>
                {/* Send Icon */}
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                <span className="font-display font-semibold hidden sm:inline">Send</span>
              </>
            )}
          </button>
        </div>

        {/* Hint Text - Hidden on mobile */}
        <div className="hidden sm:block mt-2 px-2">
          <p className="text-xs text-gray-500 font-body">
            Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">Enter</kbd> to send,
            <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs ml-1">Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>
    </form>
  );
}
