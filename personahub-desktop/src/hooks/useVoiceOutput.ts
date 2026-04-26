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

  // QA finding EC3: consolidated router lifecycle. Previously the router
  // was created/destroyed in one effect (deps: voiceProvider/voiceId/speed)
  // and ALSO cancelled in a second effect (deps: personaId). Under a rapid
  // persona switch, an in-flight `decodeAudioData` promise could still
  // resolve and call `audioSource.start()` after a `cancel()` had fired
  // from the second effect. Keying a single effect on all four inputs
  // guarantees the router is torn down AND re-created when any of them
  // changes, so there is no stale router state between renders.
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
      if (routerRef.current) {
        routerRef.current.cancel();
        routerRef.current.destroy();
      }
      if (amplitudeTimerRef.current) clearInterval(amplitudeTimerRef.current);
    };
  }, [voiceProvider, voiceId, voiceSpeed, personaId]);

  // QA finding INT4 / Phase 3.5: cancel in-flight TTS if the currently-active
  // persona gets deleted from the main process.
  useEffect(() => {
    const off = window.electronAPI.agent.onPersonaDeleted((deletedId) => {
      if (deletedId === personaId) {
        if (routerRef.current) routerRef.current.cancel();
        setIsSpeaking(false);
        setCurrentAmplitude(0);
        setCurrentWord('');
        setAvatarState('idle');
        if (amplitudeTimerRef.current) {
          clearInterval(amplitudeTimerRef.current);
          amplitudeTimerRef.current = null;
        }
      }
    });
    return off;
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
