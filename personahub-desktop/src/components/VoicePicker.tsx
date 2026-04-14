/**
 * VoicePicker — Grouped radio list for selecting a persona's voice.
 * Shows available voices grouped by gender, with inline preview.
 */
import { useState, useCallback } from 'react';
import { useSpeechSynthesis } from '../lib/speech/useSpeechSynthesis';

interface VoicePickerProps {
  selectedVoiceId?: string;
  personaName?: string;
  onChange: (voiceId: string) => void;
}

export default function VoicePicker({ selectedVoiceId, personaName = 'Persona', onChange }: VoicePickerProps) {
  const { voices, speak, cancel, isSpeaking } = useSpeechSynthesis();
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const handlePreview = useCallback(
    (voiceName: string) => {
      cancel();
      if (previewingId === voiceName) {
        setPreviewingId(null);
        return;
      }
      setPreviewingId(voiceName);
      speak(`Hi, I'm ${personaName}!`, { voiceName });
      // Clear preview state after a short delay
      setTimeout(() => setPreviewingId(null), 3000);
    },
    [cancel, speak, previewingId, personaName],
  );

  if (voices.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-2">
        No local voices available. Try installing enhanced voices in your OS settings.
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {voices.slice(0, 12).map((voice) => (
        <label
          key={voice.name}
          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
            selectedVoiceId === voice.name
              ? 'bg-indigo-600/20 ring-1 ring-indigo-500'
              : 'hover:bg-gray-800'
          }`}
        >
          <input
            type="radio"
            name="voice"
            value={voice.name}
            checked={selectedVoiceId === voice.name}
            onChange={() => onChange(voice.name)}
            className="sr-only"
          />
          <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
            selectedVoiceId === voice.name ? 'border-indigo-500 bg-indigo-500' : 'border-gray-600'
          }`} />
          <span className="text-sm text-white truncate flex-1">{voice.name}</span>
          <span className="text-xs text-gray-500">{voice.lang}</span>
          <button
            onClick={(e) => { e.preventDefault(); handlePreview(voice.name); }}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex-shrink-0"
          >
            {previewingId === voice.name && isSpeaking ? '■' : '▶'}
          </button>
        </label>
      ))}
    </div>
  );
}
