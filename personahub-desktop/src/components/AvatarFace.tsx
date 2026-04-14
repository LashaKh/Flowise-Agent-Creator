/**
 * AvatarFace — Animated SVG face that reacts to persona state.
 *
 * The mouth opens/closes based on amplitude (0–1), eyes blink randomly,
 * and the ring color changes per state (speaking = indigo, listening = emerald, etc.)
 * Six style variants give each persona a distinct look.
 */
import { forwardRef, useImperativeHandle, useState, useEffect, useRef } from 'react';
import type { AvatarState, AvatarStyleId } from '../types';

// ─── Color constants (dark palette) ────────────
const COLORS = {
  headFill: '#374151',     // gray-700 (was gray-800 — too dark to see)
  headStroke: '#4b5563',   // gray-600 (subtle outline for definition)
  eyeFill: '#e5e7eb',      // gray-200 (brighter eyes)
  mouthStroke: '#9ca3af',  // gray-400
  ringIdle: '#4b5563',     // gray-600
  ringSpeaking: '#6366f1', // indigo-500
  ringListening: '#10b981',// emerald-500
  ringThinking: '#8b5cf6', // violet-500
  ringError: '#f43f5e',    // rose-500
  bgGradientStart: '#0f172a', // slate-900 (darker bg for more contrast)
  bgGradientEnd: '#1e293b',   // slate-800
} as const;

const RING_BY_STATE: Record<AvatarState, string> = {
  idle: COLORS.ringIdle,
  thinking: COLORS.ringThinking,
  speaking: COLORS.ringSpeaking,
  listening: COLORS.ringListening,
  error: COLORS.ringError,
  initializing: COLORS.ringIdle,
};

// ─── Style Variants ────────────────────────────
interface StyleParams {
  headRx: number; headRy: number;
  eyeRx: number; eyeRy: number; eyeSpread: number; eyeY: number;
  mouthRx: number; mouthBaseRy: number; mouthY: number;
  browOffset: number; browCurve: number;
}

const STYLE_PRESETS: Record<AvatarStyleId, StyleParams> = {
  'face-warm':    { headRx: 55, headRy: 58, eyeRx: 6,  eyeRy: 7,  eyeSpread: 22, eyeY: -8,  mouthRx: 14, mouthBaseRy: 2, mouthY: 18, browOffset: 14, browCurve: 4 },
  'face-cool':    { headRx: 50, headRy: 60, eyeRx: 5,  eyeRy: 6,  eyeSpread: 20, eyeY: -10, mouthRx: 12, mouthBaseRy: 1, mouthY: 20, browOffset: 15, browCurve: 2 },
  'face-playful': { headRx: 56, headRy: 56, eyeRx: 8,  eyeRy: 9,  eyeSpread: 24, eyeY: -6,  mouthRx: 16, mouthBaseRy: 3, mouthY: 16, browOffset: 16, browCurve: 5 },
  'face-serious': { headRx: 48, headRy: 62, eyeRx: 5,  eyeRy: 5,  eyeSpread: 18, eyeY: -12, mouthRx: 10, mouthBaseRy: 1, mouthY: 22, browOffset: 12, browCurve: 1 },
  'face-gentle':  { headRx: 54, headRy: 57, eyeRx: 7,  eyeRy: 8,  eyeSpread: 21, eyeY: -7,  mouthRx: 13, mouthBaseRy: 2, mouthY: 17, browOffset: 13, browCurve: 3 },
  'face-bold':    { headRx: 52, headRy: 64, eyeRx: 6,  eyeRy: 6,  eyeSpread: 19, eyeY: -11, mouthRx: 15, mouthBaseRy: 2, mouthY: 21, browOffset: 14, browCurve: 2 },
};

// ��── Props ─────────────────────────────────────
export interface AvatarFaceProps {
  amplitude?: number;         // 0–1, drives mouth opening
  state?: AvatarState;
  styleId?: AvatarStyleId;
  accentHue?: number;         // 0–360, tints the face
  personaName?: string;
  collapsed?: boolean;
}

export interface AvatarFaceRef {
  setAmplitude: (n: number) => void;
  setState: (s: AvatarState) => void;
}

const AvatarFace = forwardRef<AvatarFaceRef, AvatarFaceProps>(function AvatarFace(
  { amplitude = 0, state = 'idle', styleId = 'face-warm', accentHue = 0, personaName = 'Persona', collapsed = false },
  ref,
) {
  const [internalAmplitude, setInternalAmplitude] = useState(amplitude);
  const [internalState, setInternalState] = useState<AvatarState>(state);
  const [blinkPhase, setBlinkPhase] = useState(false);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose imperative methods
  useImperativeHandle(ref, () => ({
    setAmplitude: (n: number) => setInternalAmplitude(Math.max(0, Math.min(1, n))),
    setState: (s: AvatarState) => setInternalState(s),
  }));

  // Sync with prop changes
  useEffect(() => setInternalAmplitude(amplitude), [amplitude]);
  useEffect(() => setInternalState(state), [state]);

  // Random blink animation (every 3-7s)
  useEffect(() => {
    function scheduleBlink() {
      const delay = 3000 + Math.random() * 4000;
      blinkTimerRef.current = setTimeout(() => {
        setBlinkPhase(true);
        setTimeout(() => setBlinkPhase(false), 150);
        scheduleBlink();
      }, delay);
    }
    scheduleBlink();
    return () => { if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current); };
  }, []);

  if (collapsed) return null;

  const s = STYLE_PRESETS[styleId] || STYLE_PRESETS['face-warm'];
  const ringColor = RING_BY_STATE[internalState] || COLORS.ringIdle;
  const mouthRy = s.mouthBaseRy + internalAmplitude * 8; // Mouth opens with amplitude
  const ringOpacity = internalState === 'idle' ? 0.3 : 0.7;
  const eyeScaleY = blinkPhase ? 0.1 : 1;

  // Thinking state: slight upward gaze
  const eyeOffsetY = internalState === 'thinking' ? -3 : 0;

  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: 240 }}
      role="img"
      aria-label={`Animated avatar of ${personaName}, currently ${internalState}`}
    >
      <svg
        viewBox="-80 -80 160 160"
        width="100%"
        height="100%"
        style={{
          maxWidth: 240,
          maxHeight: 240,
          filter: accentHue ? `hue-rotate(${accentHue}deg)` : undefined,
        }}
      >
        <defs>
          <radialGradient id="bg-grad">
            <stop offset="0%" stopColor={COLORS.bgGradientStart} />
            <stop offset="100%" stopColor={COLORS.bgGradientEnd} />
          </radialGradient>
        </defs>

        {/* Background circle */}
        <circle cx="0" cy="0" r="75" fill="url(#bg-grad)" />

        {/* State ring */}
        <circle
          cx="0" cy="0" r="72"
          fill="none"
          stroke={ringColor}
          strokeWidth="3"
          opacity={ringOpacity}
          style={{
            transition: reducedMotion ? 'none' : 'stroke 200ms, opacity 200ms',
          }}
        />

        {/* Head */}
        <ellipse
          cx="0" cy="0"
          rx={s.headRx} ry={s.headRy}
          fill={COLORS.headFill}
          stroke={COLORS.headStroke}
          strokeWidth="1.5"
          style={{
            transition: reducedMotion ? 'none' : 'transform 3s ease-in-out',
            transform: reducedMotion ? 'none' : undefined,
            animation: reducedMotion ? 'none' : 'breathe 4s ease-in-out infinite',
          }}
        />

        {/* Left eye */}
        <ellipse
          cx={-s.eyeSpread} cy={s.eyeY + eyeOffsetY}
          rx={s.eyeRx} ry={s.eyeRy * eyeScaleY}
          fill={COLORS.eyeFill}
          style={{
            transition: reducedMotion ? 'none' : 'ry 100ms, cy 200ms',
          }}
        />

        {/* Right eye */}
        <ellipse
          cx={s.eyeSpread} cy={s.eyeY + eyeOffsetY}
          rx={s.eyeRx} ry={s.eyeRy * eyeScaleY}
          fill={COLORS.eyeFill}
          style={{
            transition: reducedMotion ? 'none' : 'ry 100ms, cy 200ms',
          }}
        />

        {/* Eyebrows (subtle) */}
        <path
          d={`M ${-s.eyeSpread - 8} ${s.eyeY - s.browOffset} Q ${-s.eyeSpread} ${s.eyeY - s.browOffset - s.browCurve} ${-s.eyeSpread + 8} ${s.eyeY - s.browOffset}`}
          fill="none"
          stroke={COLORS.mouthStroke}
          strokeWidth="1.5"
          opacity="0.5"
        />
        <path
          d={`M ${s.eyeSpread - 8} ${s.eyeY - s.browOffset} Q ${s.eyeSpread} ${s.eyeY - s.browOffset - s.browCurve} ${s.eyeSpread + 8} ${s.eyeY - s.browOffset}`}
          fill="none"
          stroke={COLORS.mouthStroke}
          strokeWidth="1.5"
          opacity="0.5"
        />

        {/* Mouth */}
        <ellipse
          cx="0" cy={s.mouthY}
          rx={s.mouthRx} ry={mouthRy}
          fill={internalState === 'speaking' ? '#374151' : 'none'}
          stroke={COLORS.mouthStroke}
          strokeWidth="2"
          style={{
            transition: reducedMotion ? 'none' : 'ry 100ms',
          }}
        />

        {/* Error indicator (X eyes) */}
        {internalState === 'error' && (
          <>
            <line x1={-s.eyeSpread - 4} y1={s.eyeY - 4} x2={-s.eyeSpread + 4} y2={s.eyeY + 4} stroke={COLORS.ringError} strokeWidth="2" />
            <line x1={-s.eyeSpread + 4} y1={s.eyeY - 4} x2={-s.eyeSpread - 4} y2={s.eyeY + 4} stroke={COLORS.ringError} strokeWidth="2" />
            <line x1={s.eyeSpread - 4} y1={s.eyeY - 4} x2={s.eyeSpread + 4} y2={s.eyeY + 4} stroke={COLORS.ringError} strokeWidth="2" />
            <line x1={s.eyeSpread + 4} y1={s.eyeY - 4} x2={s.eyeSpread - 4} y2={s.eyeY + 4} stroke={COLORS.ringError} strokeWidth="2" />
          </>
        )}

        {/* Thinking pulse ring */}
        {internalState === 'thinking' && !reducedMotion && (
          <circle
            cx="0" cy="0" r="72"
            fill="none"
            stroke={COLORS.ringThinking}
            strokeWidth="2"
            opacity="0.4"
            style={{ animation: 'pulse-ring 2s ease-in-out infinite' }}
          />
        )}
      </svg>

      {/* CSS animations (injected once) */}
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.015); }
        }
        @keyframes pulse-ring {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.03); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes breathe { 0%, 100% { transform: none; } }
          @keyframes pulse-ring { 0%, 100% { opacity: 0.2; transform: none; } }
        }
      `}</style>
    </div>
  );
});

export default AvatarFace;
