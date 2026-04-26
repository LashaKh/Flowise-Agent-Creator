/**
 * useVoiceInput — Manages microphone recording and speech-to-text.
 *
 * Records audio via MediaRecorder, then sends it to the OpenClaw gateway
 * for transcription (same API key the user already set up).
 * The Web Speech API doesn't work in Electron — it can't reach Google's
 * servers — so we handle STT through the local gateway instead.
 *
 * Auto-stop triggers: window blur, 60s cap, explicit cancel.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export type MicState = 'idle' | 'requesting-permission' | 'recording' | 'transcribing' | 'denied' | 'error';

export interface UseVoiceInputOptions {
  autoStopOnBlur?: boolean;
  maxDurationMs?: number;
  onTranscript?: (text: string) => void;
}

export interface UseVoiceInputResult {
  micState: MicState;
  isRecording: boolean;
  transcribedText: string;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  cancelRecording: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputResult {
  const { autoStopOnBlur = true, maxDurationMs = 60000, onTranscript } = options;

  const [micState, setMicState] = useState<MicState>('idle');
  const [transcribedText, setTranscribedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const micStateRef = useRef<MicState>(micState);

  // Keep callback ref in sync
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { micStateRef.current = micState; }, [micState]);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* already stopped */ }
    }
    recorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(async () => {
    if (micState === 'recording' || micState === 'transcribing') return;

    setError(null);
    setTranscribedText('');
    cancelledRef.current = false;
    setMicState('requesting-permission');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Pick a supported audio format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Don't transcribe if the recording was cancelled
        if (cancelledRef.current) return;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        // Stop mic tracks
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }

        if (blob.size < 100) {
          setMicState('idle');
          return; // Too short to transcribe
        }

        setMicState('transcribing');
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const result = await window.electronAPI.stt.transcribe(arrayBuffer, mimeType);
          const text = result.text?.trim() || '';
          setTranscribedText(text);
          setMicState('idle');
          if (text && onTranscriptRef.current) {
            onTranscriptRef.current(text);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Transcription failed');
          setMicState('error');
          // QA finding EC6: fully release the recorder ref so a subsequent
          // startRecording() builds a fresh recorder instead of finding a
          // stale one lingering in memory.
          recorderRef.current = null;
          // Auto-recover to idle after a short delay so the user isn't stuck
          // in the error state forever — the error text is still displayed
          // via `error` state, but the mic becomes usable again.
          setTimeout(() => {
            setMicState((s) => (s === 'error' ? 'idle' : s));
          }, 2000);
        }
      };

      recorderRef.current = recorder;
      recorder.start(1000); // Collect chunks every second
      setMicState('recording');

      // Max duration cap
      timeoutRef.current = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state === 'recording') {
          recorderRef.current.stop();
        }
      }, maxDurationMs);

    } catch (err) {
      cleanup();
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setMicState('denied');
        setError('Microphone permission denied. Check System Settings → Privacy → Microphone.');
      } else {
        setMicState('error');
        setError(err instanceof Error ? err.message : 'Failed to start recording');
      }
    }
  }, [micState, maxDurationMs, cleanup]);

  const stopRecording = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    // Stop the recorder — onstop handler will trigger transcription
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    cleanup();
    setTranscribedText('');
    setMicState('idle');
  }, [cleanup]);

  // Auto-stop on blur
  useEffect(() => {
    if (!autoStopOnBlur) return;
    function handleBlur() {
      if (micState === 'recording') {
        stopRecording();
      }
    }
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [autoStopOnBlur, micState, stopRecording]);

  // Listen for power events (lock screen / suspend).
  // Use micStateRef + cancelRecording ref so listener binds once, not on every
  // micState change (avoids add/remove churn during recording).
  const cancelRecordingRef = useRef(cancelRecording);
  useEffect(() => { cancelRecordingRef.current = cancelRecording; }, [cancelRecording]);

  useEffect(() => {
    function handlePowerEvent() {
      if (micStateRef.current === 'recording') {
        cancelRecordingRef.current();
      }
    }
    window.addEventListener('power:lock' as string, handlePowerEvent);
    window.addEventListener('power:suspend' as string, handlePowerEvent);
    return () => {
      window.removeEventListener('power:lock' as string, handlePowerEvent);
      window.removeEventListener('power:suspend' as string, handlePowerEvent);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  return {
    micState,
    isRecording: micState === 'recording',
    transcribedText,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
