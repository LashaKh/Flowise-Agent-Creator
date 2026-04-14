import { useState, useRef, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import MicButton from './MicButton';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface ChatInputProps {
  personaName: string;
  personaId?: string | null;
  onSend: (message: string) => void;
  disabled: boolean;
  /** True while an assistant response is actively streaming. */
  isStreaming?: boolean;
}

export default function ChatInput({ personaName, personaId, onSend, disabled, isStreaming }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const voiceInput = useVoiceInput({
    onTranscript: (transcript) => {
      setText((prev) => prev + (prev ? ' ' : '') + transcript);
    },
  });

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
    // Space-hold PTT: only when textarea is empty
    if (e.key === ' ' && text.length === 0 && !voiceInput.isRecording) {
      e.preventDefault();
      voiceInput.startRecording();
    }
    // Escape cancels recording
    if (e.key === 'Escape' && voiceInput.isRecording) {
      voiceInput.cancelRecording();
    }
  };

  const handleKeyUp = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Release Space stops recording (PTT mode)
    if (e.key === ' ' && voiceInput.isRecording) {
      voiceInput.stopRecording();
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
        <MicButton
          micState={voiceInput.micState}
          isRecording={voiceInput.isRecording}
          onStart={voiceInput.startRecording}
          onStop={voiceInput.stopRecording}
          onCancel={voiceInput.cancelRecording}
          error={voiceInput.error}
        />
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          placeholder={`Message ${personaName}...`}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-lg px-4 py-2.5 resize-none text-sm border border-gray-700 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
        />
        {/* Audit finding P4-E-5: expose the existing stopGeneration IPC as
            a Stop button so users can interrupt long responses. */}
        {isStreaming && personaId ? (
          <button
            onClick={() => window.electronAPI.agent.stopGeneration(personaId)}
            className="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors flex-shrink-0"
            title="Stop generating"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
