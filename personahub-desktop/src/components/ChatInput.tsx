import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from 'react';

interface ChatInputProps {
  personaName: string;
  onSend: (message: string) => void;
  disabled: boolean;
}

export default function ChatInput({ personaName, onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize up to 4 lines (~96px)
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  };

  return (
    <div className="border-t border-gray-800 p-4">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${personaName}...`}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-lg px-4 py-2.5 resize-none text-sm border border-gray-700 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
