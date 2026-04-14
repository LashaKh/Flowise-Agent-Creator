/**
 * useVoiceOutput — Connects the TTS router to the chat flow.
 *
 * When a persona finishes a reply (onAssistantDone), this hook:
 * 1. Normalizes the text
 * 2. Sends it through the TTS router (cloud → Web Speech → silent)
 * 3. Drives the avatar's mouth amplitude and state
 *
 * Handles interruption (new message cancels speech), persona switch, and cleanup.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { createTtsRouter, type TtsRouter } from '../lib/speech/ttsRouter';
import type { AvatarState, VoiceProvider } from '../types';

export interface UseVoiceOutputOptions {
  personaId: string | null;
  voiceEnabled?: boolean;
  voiceProvider?: VoiceProvider;
  voiceId?: string;
  voiceSpeed?: number;
}

export interface UseVoiceOutputResult {
  isSpeaking: boolean;
  currentAmplitude: number;
  currentWord: string;
  avatarState: AvatarState;
  cancel: () => void;
  /** Pass this as onAssistantDone to useChat */
  handleAssistantDone: (content: string, personaId: string) => void;
}

export function useVoiceOutput(options: UseVoiceOutputOptions): UseVoiceOutputResult {
  const { personaId, voiceEnabled = true, voiceProvider = 'auto', voiceId, voiceSpeed } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentAmplitude, setCurrentAmplitude] = useState(0);
  const [currentWord, setCurrentWord] = useState('');
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');

  const routerRef = useRef<TtsRouter | null>(null);
  const amplitudeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create/recreate TTS router when provider settings change
  useEffect(() => {
    if (routerRef.current) routerRef.current.destroy();

    routerRef.current = createTtsRouter({
      preferredProvider: voiceProvider,
      voiceId,
      speed: voiceSpeed,
      callbacks: {
        onStart: () => {
          setIsSpeaking(true);
          setAvatarState('speaking');
          // Audit finding P3-D-3: the web-speech TTS router fires onStart
          // twice (once eagerly, once when the utterance actually starts).
          // Without this guard, the second call overwrote amplitudeTimerRef
          // without clearing the first interval — a leak of 10 setState
          // calls/sec that only stopped on unmount.
          if (amplitudeTimerRef.current) clearInterval(amplitudeTimerRef.current);
          amplitudeTimerRef.current = setInterval(() => {
            setCurrentAmplitude(0.3 + Math.random() * 0.5);
          }, 100);
        },
        onBoundary: (word) => setCurrentWord(word),
        onEnd: () => {
          setIsSpeaking(false);
          setCurrentAmplitude(0);
          setCurrentWord('');
          setAvatarState('idle');
          if (amplitudeTimerRef.current) {
            clearInterval(amplitudeTimerRef.current);
            amplitudeTimerRef.current = null;
          }
        },
        onError: () => {
          setAvatarState('error');
          setIsSpeaking(false);
          setCurrentAmplitude(0);
          if (amplitudeTimerRef.current) {
            clearInterval(amplitudeTimerRef.current);
            amplitudeTimerRef.current = null;
          }
        },
      },
    });

    return () => {
      if (routerRef.current) routerRef.current.destroy();
      if (amplitudeTimerRef.current) clearInterval(amplitudeTimerRef.current);
    };
  }, [voiceProvider, voiceId, voiceSpeed]);

  // Cancel speech when persona changes
  useEffect(() => {
    return () => {
      if (routerRef.current) routerRef.current.cancel();
      setIsSpeaking(false);
      setCurrentAmplitude(0);
      setAvatarState('idle');
    };
  }, [personaId]);

  const cancel = useCallback(() => {
    if (routerRef.current) routerRef.current.cancel();
    setIsSpeaking(false);
    setCurrentAmplitude(0);
    setCurrentWord('');
    setAvatarState('idle');
    if (amplitudeTimerRef.current) {
      clearInterval(amplitudeTimerRef.current);
      amplitudeTimerRef.current = null;
    }
  }, []);

  const handleAssistantDone = useCallback(
    (content: string, donePersonaId: string) => {
      if (!voiceEnabled || !routerRef.current) return;
      if (donePersonaId !== personaId) return;

      setAvatarState('thinking');
      routerRef.current.speak(content, donePersonaId);
    },
    [personaId, voiceEnabled],
  );

  return { isSpeaking, currentAmplitude, currentWord, avatarState, cancel, handleAssistantDone };
}
