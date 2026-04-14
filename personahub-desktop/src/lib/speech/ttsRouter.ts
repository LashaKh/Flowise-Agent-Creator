/**
 * TTS Router — orchestrates text-to-speech across multiple providers.
 *
 * Fallback chain: Cloud (via IPC) → Web Speech (browser-native) → Silent (caption-only)
 * - Exponential backoff on cloud failures (3 attempts)
 * - Session flap guard (max 5 cloud↔native transitions)
 * - Cancel-before-speak guarantee (no overlapping audio)
 */
import { normalizeForSpeech } from './textNormalizer';
import { logVoiceEvent } from './voiceEventLog';
import type { VoiceProvider } from '../../types';

// ─── Types ────────────────────────────────────

export type TtsProviderType = 'cloud' | 'web-speech' | 'silent';

export interface TtsCallbacks {
  onStart?: () => void;
  onBoundary?: (word: string) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  onProviderSwitch?: (from: TtsProviderType, to: TtsProviderType) => void;
}

export interface TtsRouter {
  speak: (text: string, personaId: string) => Promise<void>;
  cancel: () => void;
  isSpeaking: () => boolean;
  getCurrentProvider: () => TtsProviderType;
  destroy: () => void;
}

interface TtsRouterOptions {
  preferredProvider: VoiceProvider;
  voiceId?: string;
  speed?: number;
  callbacks?: TtsCallbacks;
}

// ─── Router Implementation ────────────────────

const MAX_CLOUD_RETRIES = 3;
const MAX_FLAP_TRANSITIONS = 5;

export function createTtsRouter(options: TtsRouterOptions): TtsRouter {
  let speaking = false;
  let cancelled = false;
  let destroyed = false;
  let currentProvider: TtsProviderType = 'silent';
  let flapCount = 0;
  let currentUtterance: SpeechSynthesisUtterance | null = null;
  let audioContext: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;

  function switchProvider(to: TtsProviderType) {
    const from = currentProvider;
    if (from !== to) {
      flapCount++;
      currentProvider = to;
      options.callbacks?.onProviderSwitch?.(from, to);
    }
  }

  async function speakViaCloud(normalizedText: string, personaId: string): Promise<boolean> {
    if (typeof window === 'undefined' || !window.electronAPI?.tts?.synthesize) return false;

    const voiceId = options.voiceId || 'alloy';
    const provider = options.preferredProvider === 'auto' ? 'cloud-openai' : options.preferredProvider;

    // Only attempt cloud for cloud providers
    if (!provider.startsWith('cloud-')) return false;

    for (let attempt = 0; attempt < MAX_CLOUD_RETRIES; attempt++) {
      if (cancelled || destroyed) return false;

      try {
        const result = await window.electronAPI.tts.synthesize(
          normalizedText, voiceId, provider, personaId
        );

        if (cancelled || destroyed) return false;

        // Play the audio via Web Audio API
        if (!audioContext) audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(
          result instanceof ArrayBuffer ? result : (result as { audioBuffer: ArrayBuffer }).audioBuffer
        );

        if (cancelled || destroyed) return false;

        return new Promise<boolean>((resolve) => {
          audioSource = audioContext!.createBufferSource();
          audioSource.buffer = audioBuffer;
          audioSource.playbackRate.value = options.speed ?? 1.0;
          audioSource.connect(audioContext!.destination);

          audioSource.onended = () => {
            audioSource = null;
            resolve(true);
          };

          audioSource.start();
          switchProvider('cloud');
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logVoiceEvent({
          eventType: 'voice-output-error',
          personaId,
          providerUsed: provider,
          errorCategory: 'network',
          errorCode: msg.includes('Rate limited') ? 'RATE_LIMITED' : 'CLOUD_FAILURE',
        });

        // Exponential backoff: 500ms, 1s, 2s
        if (attempt < MAX_CLOUD_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }

    return false;
  }

  function speakViaWebSpeech(normalizedText: string, personaId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(normalizedText);
      utterance.rate = options.speed ?? 1.0;
      currentUtterance = utterance;

      // Try to find a local voice — but don't bail if voices list is empty.
      // On macOS/Electron, getVoices() can return [] initially (async load),
      // but speechSynthesis.speak() still works with the OS default voice.
      const allVoices = speechSynthesis.getVoices();
      const localVoices = allVoices.filter((v) => v.localService);
      if (localVoices.length > 0 && localVoices[0]) {
        utterance.voice = localVoices[0];
      }
      // Don't return false on empty voices — let the OS use its default

      utterance.onstart = () => {
        switchProvider('web-speech');
        options.callbacks?.onStart?.();
      };

      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          const word = normalizedText.substring(event.charIndex, event.charIndex + event.charLength);
          options.callbacks?.onBoundary?.(word);
        }
      };

      utterance.onend = () => {
        currentUtterance = null;
        resolve(true);
      };

      utterance.onerror = (event) => {
        currentUtterance = null;
        if (event.error === 'canceled' || event.error === 'interrupted') {
          resolve(false);
          return;
        }
        logVoiceEvent({
          eventType: 'voice-output-error',
          personaId,
          providerUsed: 'os-native',
          errorCategory: 'hardware',
          errorCode: `WEB_SPEECH_${event.error.toUpperCase()}`,
        });
        resolve(false);
      };

      speechSynthesis.speak(utterance);
    });
  }

  return {
    async speak(text: string, personaId: string) {
      if (destroyed) return;

      // Cancel any in-progress speech first (no overlap guarantee)
      this.cancel();
      cancelled = false;
      speaking = true;

      const normalizedText = normalizeForSpeech(text);
      if (!normalizedText) {
        speaking = false;
        return;
      }

      const startTime = Date.now();
      logVoiceEvent({ eventType: 'voice-output-started', personaId, providerUsed: options.preferredProvider });
      options.callbacks?.onStart?.();

      // Check flap guard
      const canUseCloud = flapCount < MAX_FLAP_TRANSITIONS;

      let success = false;

      // Try cloud first (unless flap guard triggered or provider is os-native/local-only)
      if (canUseCloud && options.preferredProvider !== 'os-native' && options.preferredProvider !== 'local-only') {
        success = await speakViaCloud(normalizedText, personaId);
        if (success && !cancelled) {
          logVoiceEvent({
            eventType: 'voice-output-completed',
            personaId,
            providerUsed: options.preferredProvider,
            durationMs: Date.now() - startTime,
          });
        }
      }

      // Fall back to Web Speech if cloud failed
      if (!success && !cancelled && !destroyed) {
        logVoiceEvent({ eventType: 'voice-output-fallback', personaId, providerUsed: 'os-native' });
        success = await speakViaWebSpeech(normalizedText, personaId);
        if (success && !cancelled) {
          logVoiceEvent({
            eventType: 'voice-output-completed',
            personaId,
            providerUsed: 'os-native',
            durationMs: Date.now() - startTime,
          });
        }
      }

      // Silent fallback — caption-only
      if (!success && !cancelled && !destroyed) {
        switchProvider('silent');
        options.callbacks?.onBoundary?.(normalizedText);
      }

      speaking = false;
      if (!cancelled) options.callbacks?.onEnd?.();
    },

    cancel() {
      cancelled = true;
      speaking = false;

      // Stop Web Speech
      if (currentUtterance) {
        speechSynthesis.cancel();
        currentUtterance = null;
      }

      // Stop Web Audio
      if (audioSource) {
        try { audioSource.stop(); } catch { /* already stopped */ }
        audioSource = null;
      }
    },

    isSpeaking: () => speaking,
    getCurrentProvider: () => currentProvider,

    destroy() {
      destroyed = true;
      this.cancel();
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
    },
  };
}
