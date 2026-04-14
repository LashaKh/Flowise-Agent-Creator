/**
 * Web Speech API hook — the free, offline fallback for text-to-speech.
 * Uses the browser's built-in speech synthesis (macOS Siri voices, Windows Aria, etc.)
 *
 * Key gotcha: speechSynthesis.getVoices() returns [] on the first call in Chromium.
 * We retry via the voiceschanged event + polling.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export interface SpeechOptions {
  rate?: number;
  pitch?: number;
  voiceName?: string;
}

export interface UseSpeechSynthesisResult {
  speak: (text: string, options?: SpeechOptions) => void;
  cancel: () => void;
  isSpeaking: boolean;
  currentWord: string;
  voices: SpeechSynthesisVoice[];
  isAvailable: boolean;
}

/** Simple hash to derive per-persona voice variation */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Get per-persona rate/pitch variation from a deterministic hash */
export function getPersonaVoiceVariation(personaId: string): { rate: number; pitch: number } {
  const h = hashString(personaId);
  return {
    rate: 0.95 + (h % 10) / 100,       // 0.95 – 1.04
    pitch: 0.95 + ((h >> 4) % 10) / 100, // 0.95 – 1.04
  };
}

export function useSpeechSynthesis(): UseSpeechSynthesisResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentWord, setCurrentWord] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Load voices — handle the voiceschanged race condition
  useEffect(() => {
    if (!isAvailable) return;

    function loadVoices() {
      const allVoices = speechSynthesis.getVoices();
      // Filter to local-only voices (privacy: avoid online voices that route to Azure)
      const localVoices = allVoices.filter((v) => v.localService);
      if (localVoices.length > 0) {
        setVoices(localVoices);
      }
    }

    // Try immediately (might work on some browsers)
    loadVoices();

    // Also listen for voiceschanged (the reliable path)
    speechSynthesis.addEventListener('voiceschanged', loadVoices);

    // Polling fallback for edge cases where voiceschanged never fires
    let retries = 0;
    const poll = setInterval(() => {
      loadVoices();
      retries++;
      if (voices.length > 0 || retries > 10) clearInterval(poll);
    }, 200);

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      clearInterval(poll);
    };
  }, [isAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = useCallback(() => {
    if (!isAvailable) return;
    speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsSpeaking(false);
    setCurrentWord('');
  }, [isAvailable]);

  const speak = useCallback(
    (text: string, options?: SpeechOptions) => {
      if (!isAvailable || !text.trim()) return;

      // Cancel any in-progress speech first
      cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;

      // Select voice by name if specified
      if (options?.voiceName && voices.length > 0) {
        const match = voices.find((v) => v.name === options.voiceName);
        if (match) utterance.voice = match;
      }

      // Track speaking state
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        setCurrentWord('');
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setCurrentWord('');
        utteranceRef.current = null;
      };

      // Track word boundaries for captions
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          const word = text.substring(event.charIndex, event.charIndex + event.charLength);
          setCurrentWord(word);
        }
      };

      utteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
    },
    [isAvailable, voices, cancel],
  );

  return { speak, cancel, isSpeaking, currentWord, voices, isAvailable };
}
