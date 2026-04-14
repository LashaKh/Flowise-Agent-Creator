/**
 * FacePicker — Grid of avatar style thumbnails for selecting a persona's face.
 * 3×2 grid of style cards, selected = indigo ring + checkmark.
 * Optional accent hue slider.
 */
import type { AvatarStyleId } from '../types';

const STYLES: { id: AvatarStyleId; label: string; emoji: string }[] = [
  { id: 'face-warm', label: 'Warm', emoji: '🌅' },
  { id: 'face-cool', label: 'Cool', emoji: '❄️' },
  { id: 'face-playful', label: 'Playful', emoji: '🎈' },
  { id: 'face-serious', label: 'Serious', emoji: '🎯' },
  { id: 'face-gentle', label: 'Gentle', emoji: '🌿' },
  { id: 'face-bold', label: 'Bold', emoji: '⚡' },
];

interface FacePickerProps {
  selectedStyleId?: AvatarStyleId;
  accentHue?: number;
  onChange: (styleId: AvatarStyleId) => void;
  onHueChange?: (hue: number) => void;
}

export default function FacePicker({ selectedStyleId = 'face-warm', accentHue = 0, onChange, onHueChange }: FacePickerProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {STYLES.map((style) => (
          <button
            key={style.id}
            onClick={() => onChange(style.id)}
            className={`relative flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition-all ${
              selectedStyleId === style.id
                ? 'bg-indigo-600/20 ring-2 ring-indigo-500'
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <span className="text-2xl">{style.emoji}</span>
            <span className="text-xs text-gray-300">{style.label}</span>
            {selectedStyleId === style.id && (
              <span className="absolute top-1 right-1 text-indigo-400 text-xs">✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Accent hue slider */}
      {onHueChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Accent</span>
          <input
            type="range"
            min="0"
            max="360"
            value={accentHue}
            onChange={(e) => onHueChange(parseInt(e.target.value))}
            className="flex-1"
            style={{
              background: `linear-gradient(to right, hsl(0,70%,50%), hsl(60,70%,50%), hsl(120,70%,50%), hsl(180,70%,50%), hsl(240,70%,50%), hsl(300,70%,50%), hsl(360,70%,50%))`,
            }}
          />
          <div
            className="w-5 h-5 rounded-full border border-gray-600"
            style={{ backgroundColor: `hsl(${accentHue}, 70%, 50%)` }}
          />
        </div>
      )}
    </div>
  );
}
