import { useState, useEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import { useUpdatePersona } from '../hooks/useUpdatePersona';
import type { Persona } from '../types';

interface SettingsPanelProps {
  persona: Persona;
  onUpdate: (persona: Persona) => void;
}

export function SettingsPanel({ persona, onUpdate }: SettingsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState(persona.systemPrompt);
  const [temperature, setTemperature] = useState(persona.settings?.temperature ?? 0.7);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Store the "last saved" values in refs so they always track the latest
  // persona prop (which represents what was last persisted). Previously
  // these were captured in useState at mount and never updated — the
  // "Unsaved Changes" badge stayed stuck after saving and Reset reverted
  // to the very first values rather than the last saved state
  // (audit finding P3-D-7).
  const originalSystemPromptRef = useRef(persona.systemPrompt);
  const originalTemperatureRef = useRef(persona.settings?.temperature ?? 0.7);

  const { updatePersona, isLoading } = useUpdatePersona(persona.id);

  // Track if there are unsaved changes against the most recently saved values
  const hasChanges =
    systemPrompt !== originalSystemPromptRef.current ||
    temperature !== originalTemperatureRef.current;

  // Calculate metrics
  const charCount = systemPrompt.length;
  const wordCount = systemPrompt.trim() ? systemPrompt.trim().split(/\s+/).length : 0;
  const lineCount = systemPrompt.split('\n').length;

  // Update local state AND original refs when the persona prop changes
  // (e.g. after a save or switching personas).
  useEffect(() => {
    setSystemPrompt(persona.systemPrompt);
    setTemperature(persona.settings?.temperature ?? 0.7);
    originalSystemPromptRef.current = persona.systemPrompt;
    originalTemperatureRef.current = persona.settings?.temperature ?? 0.7;
  }, [persona.systemPrompt, persona.settings?.temperature]);

  const handleSystemPromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setSystemPrompt(e.target.value);
  };

  const handleTemperatureChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTemperature(parseFloat(e.target.value));
  };

  const handleSave = async () => {
    const updatedPersona = await updatePersona({
      systemPrompt,
      settings: { temperature },
    });

    if (updatedPersona) {
      toast.success('Settings saved successfully!');
      onUpdate(updatedPersona);
    } else {
      toast.error('Failed to save settings. Please try again.');
    }
  };

  const handleReset = () => {
    setSystemPrompt(originalSystemPromptRef.current);
    setTemperature(originalTemperatureRef.current);
    toast.success('Settings reset to last saved values');
  };

  // Audit finding: Cmd+Enter hint was shown but never wired up. Add a
  // keyboard handler on the textarea so the promised shortcut actually works.
  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && hasChanges && !isLoading) {
      e.preventDefault();
      handleSave();
    }
  };

  const getTemperatureLabel = (temp: number) => {
    if (temp <= 0.3) return 'Precise & Focused';
    if (temp <= 0.5) return 'Balanced';
    if (temp <= 0.7) return 'Creative';
    return 'Highly Creative';
  };

  const getTemperatureColor = (temp: number) => {
    if (temp <= 0.3) return 'from-blue-500 to-cyan-500';
    if (temp <= 0.5) return 'from-green-500 to-emerald-500';
    if (temp <= 0.7) return 'from-yellow-500 to-orange-500';
    return 'from-orange-500 to-red-500';
  };

  return (
    <div className="w-full glass-strong rounded-2xl card-cosmic overflow-hidden">
      {/* Header - Collapsible Toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-8 py-6 text-left hover:glass transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-cosmic-cyan to-cosmic-purple flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {hasChanges && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-cosmic-dark animate-pulse"></div>
            )}
          </div>
          <div>
            <h3 className="font-display font-bold text-white text-xl tracking-tight">Prompt Studio</h3>
            <p className="text-xs text-gray-400 font-body mt-0.5">Fine-tune your persona's behavior</p>
          </div>
        </div>
        {hasChanges && (
          <span className="text-xs font-display font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 rounded-full uppercase tracking-wider shadow-lg shadow-amber-500/50 animate-pulse">
            Unsaved Changes
          </span>
        )}
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="border-t border-white/10">
          {/* Metrics Bar */}
          <div className="px-8 py-4 bg-white/5 border-b border-white/10">
            <div className="flex items-center justify-between text-xs font-body">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-cosmic-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <span className="text-gray-400">
                    <span className="text-white font-semibold">{wordCount}</span> words
                  </span>
                </div>
                <div className="w-px h-4 bg-white/10"></div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-cosmic-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16m-7 5h7" />
                  </svg>
                  <span className="text-gray-400">
                    <span className="text-white font-semibold">{charCount}</span> characters
                  </span>
                </div>
                <div className="w-px h-4 bg-white/10"></div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-cosmic-magenta" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <span className="text-gray-400">
                    <span className="text-white font-semibold">{lineCount}</span> lines
                  </span>
                </div>
              </div>

              {/* Edit/Preview Toggle */}
              <div className="flex items-center gap-1 glass rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('edit')}
                  className={`px-4 py-1.5 rounded-md font-display font-semibold text-xs uppercase tracking-wider transition-all ${
                    activeTab === 'edit'
                      ? 'bg-cosmic-cyan text-white shadow-lg shadow-cosmic-cyan/50'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Edit
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-4 py-1.5 rounded-md font-display font-semibold text-xs uppercase tracking-wider transition-all ${
                    activeTab === 'preview'
                      ? 'bg-cosmic-purple text-white shadow-lg shadow-cosmic-purple/50'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>
          </div>

          <div className="px-8 py-8 space-y-8">
            {/* System Prompt Editor */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="system-prompt"
                  className="block text-sm font-display font-bold text-white uppercase tracking-wider"
                >
                  System Prompt
                </label>
                {charCount > 2000 && (
                  <span className="text-xs font-display font-semibold text-amber-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Long prompt (consider shortening)
                  </span>
                )}
              </div>

              {activeTab === 'edit' ? (
                <div className="relative group">
                  <textarea
                    id="system-prompt"
                    value={systemPrompt}
                    onChange={handleSystemPromptChange}
                    onKeyDown={handleTextareaKeyDown}
                    disabled={isLoading}
                    rows={12}
                    placeholder="Enter the system prompt for this persona...&#10;&#10;Example:&#10;You are Albert Einstein, the renowned theoretical physicist. Respond with wisdom, curiosity, and a touch of humor. Draw from your vast knowledge of physics, mathematics, and philosophy..."
                    className="
                      w-full px-6 py-5 glass border-2 border-white/10 rounded-xl
                      text-white font-body text-base leading-relaxed placeholder:text-gray-500
                      hover:border-cosmic-cyan/30 focus:border-cosmic-cyan focus:ring-4 focus:ring-cosmic-cyan/20
                      disabled:opacity-50 disabled:cursor-not-allowed
                      resize-y min-h-[300px]
                      transition-all duration-300
                      scrollbar-thin scrollbar-thumb-cosmic-cyan scrollbar-track-white/5
                    "
                  />
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2 text-xs text-gray-500 font-display">
                      <kbd className="px-2 py-1 bg-white/5 rounded border border-white/10">⌘</kbd>
                      <span>+</span>
                      <kbd className="px-2 py-1 bg-white/5 rounded border border-white/10">Enter</kbd>
                      <span className="ml-1">to save</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass border-2 border-white/10 rounded-xl px-6 py-5 min-h-[300px] max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-cosmic-purple scrollbar-track-white/5">
                  <div className="text-white font-body text-base leading-relaxed whitespace-pre-wrap">
                    {systemPrompt || (
                      <span className="text-gray-500 italic">No prompt entered yet. Switch to Edit mode to add content.</span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3 glass rounded-lg p-4 border border-cosmic-cyan/20">
                <svg className="w-5 h-5 text-cosmic-cyan flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-gray-300 font-body leading-relaxed">
                    <span className="font-semibold text-cosmic-cyan">Pro Tip:</span> Be specific about personality traits, speaking style, and knowledge domains. Include examples of how the persona should respond to different types of questions.
                  </p>
                </div>
              </div>
            </div>

            {/* Temperature Slider */}
            <div className="space-y-5 glass rounded-xl p-6 border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <label
                    htmlFor="temperature"
                    className="block text-sm font-display font-bold text-white uppercase tracking-wider mb-1"
                  >
                    Creativity Level
                  </label>
                  <p className="text-xs text-gray-400 font-body">Controls response randomness and creativity</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-display font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r ${getTemperatureColor(temperature)} text-white shadow-lg`}>
                    {getTemperatureLabel(temperature)}
                  </span>
                  <span className="text-2xl font-display font-black text-white bg-white/5 px-4 py-2 rounded-xl border border-white/20 min-w-[80px] text-center">
                    {temperature.toFixed(1)}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  id="temperature"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={handleTemperatureChange}
                  disabled={isLoading}
                  className="
                    w-full h-3 rounded-full appearance-none cursor-pointer
                    disabled:cursor-not-allowed disabled:opacity-50
                    transition-all
                  "
                  style={{
                    // Audit finding P5-B-1: replaced forbidden #3b82f6 with
                    // cosmic-cyan (#06b6d4) to match the rest of the palette.
                    background: `linear-gradient(to right,
                      #06b6d4 0%,
                      #10b981 25%,
                      #f59e0b 50%,
                      #ef4444 75%,
                      #dc2626 100%
                    )`,
                    WebkitAppearance: 'none',
                    height: '12px',
                  }}
                />
                <div className="flex justify-between items-start">
                  <div className="text-center flex-1">
                    <p className="text-xs font-display font-bold text-blue-400 mb-1">0.0</p>
                    <p className="text-xs text-gray-500 font-body">Deterministic</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xs font-display font-bold text-green-400 mb-1">0.3</p>
                    <p className="text-xs text-gray-500 font-body">Focused</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xs font-display font-bold text-yellow-400 mb-1">0.7</p>
                    <p className="text-xs text-gray-500 font-body">Balanced</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xs font-display font-bold text-red-400 mb-1">1.0</p>
                    <p className="text-xs text-gray-500 font-body">Random</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 pt-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={isLoading || !hasChanges}
                className={`
                  flex-1 px-8 py-4 font-display font-bold text-base rounded-xl
                  transition-all duration-300 transform
                  ${isLoading || !hasChanges
                    ? 'btn-cosmic opacity-50 cursor-not-allowed scale-100'
                    : 'btn-cosmic hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-cosmic-cyan/30'
                  }
                `}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Saving Changes...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Save Changes
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading || !hasChanges}
                className={`
                  px-8 py-4 font-display font-bold text-base rounded-xl
                  transition-all duration-300 transform
                  ${isLoading || !hasChanges
                    ? 'glass opacity-50 cursor-not-allowed border border-white/10 text-gray-500 scale-100'
                    : 'glass hover:glass-strong border-2 border-white/20 hover:border-cosmic-purple text-white hover:scale-105 active:scale-95'
                  }
                `}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
