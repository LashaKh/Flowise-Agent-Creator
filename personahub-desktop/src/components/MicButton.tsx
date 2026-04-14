/**
 * MicButton — Push-to-talk microphone button.
 * 40×40, positioned left of textarea. Click or hold Space (when textarea empty) to record.
 * Escape cancels. First-ever press shows explanation, then OS permission dialog.
 */
import { useCallback, useState } from 'react';
import type { MicState } from '../hooks/useVoiceInput';

interface MicButtonProps {
  micState: MicState;
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  error: string | null;
}

export default function MicButton({ micState, isRecording, onStart, onStop, onCancel: _onCancel, error }: MicButtonProps) {
  const [showFirstUseHint, setShowFirstUseHint] = useState(() => {
    try { return !localStorage.getItem('mic-first-use-done'); } catch { return true; }
  });

  const handleClick = useCallback(() => {
    if (showFirstUseHint) {
      setShowFirstUseHint(false);
      try { localStorage.setItem('mic-first-use-done', 'true'); } catch { /* noop */ }
    }

    if (isRecording) {
      onStop();
    } else {
      onStart();
    }
  }, [isRecording, onStart, onStop, showFirstUseHint]);

  const isDenied = micState === 'denied';
  const isError = micState === 'error';
  const isRequesting = micState === 'requesting-permission';
  const isTranscribing = micState === 'transcribing';

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={isDenied || isTranscribing}
        aria-pressed={isRecording}
        aria-label={isTranscribing ? 'Transcribing...' : isRecording ? 'Stop recording' : 'Start recording'}
        title={isDenied ? 'Microphone denied — check System Settings' : isTranscribing ? 'Transcribing...' : isRecording ? 'Click to stop' : 'Click to record'}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          isRecording
            ? 'bg-red-500 text-white animate-pulse'
            : isTranscribing
              ? 'bg-indigo-600 text-white animate-pulse cursor-wait'
              : isDenied
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : isRequesting
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
        }`}
      >
        {isTranscribing ? (
          // Dots spinner for transcribing
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="animate-spin">
            <circle cx="8" cy="2" r="1.5" opacity="0.3" />
            <circle cx="13" cy="5" r="1.5" opacity="0.5" />
            <circle cx="13" cy="11" r="1.5" opacity="0.7" />
            <circle cx="8" cy="14" r="1.5" opacity="0.9" />
            <circle cx="3" cy="11" r="1.5" opacity="1" />
            <circle cx="3" cy="5" r="1.5" opacity="0.1" />
          </svg>
        ) : isRecording ? (
          // Stop icon
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1" />
          </svg>
        ) : (
          // Mic icon
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0V3a2 2 0 0 0-2-2z" />
            <path d="M4 7a.5.5 0 0 0-1 0 5 5 0 0 0 4.5 4.975V14H6a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H8.5v-2.025A5 5 0 0 0 13 7a.5.5 0 0 0-1 0 4 4 0 1 1-8 0z" />
          </svg>
        )}
      </button>

      {/* Error tooltip */}
      {(isDenied || isError) && error && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 text-xs text-gray-300 px-3 py-2 rounded-lg shadow-lg whitespace-nowrap z-10">
          {error}
        </div>
      )}

      {/* First-use hint card */}
      {showFirstUseHint && !isRecording && micState === 'idle' && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-gray-900 border border-indigo-500/30 text-xs text-gray-300 px-3 py-2 rounded-lg shadow-lg w-56 z-10">
          <p className="font-semibold text-white mb-1">Voice Input</p>
          <p>Click to record, click again to stop. Your speech will be transcribed into the text field.</p>
          <p className="mt-2 text-gray-400 text-[10px] leading-tight border-t border-gray-700 pt-2">
            Transcription uses your configured AI provider.
          </p>
          <button
            onClick={() => {
              setShowFirstUseHint(false);
              try { localStorage.setItem('mic-first-use-done', 'true'); } catch { /* noop */ }
            }}
            className="mt-1 text-indigo-400 hover:text-indigo-300"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
