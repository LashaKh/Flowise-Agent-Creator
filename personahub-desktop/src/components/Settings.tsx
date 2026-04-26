import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import type { UserPreferences, GlobalVoicePrefs, VoiceProvider, AvatarStyleId } from '../types';
import UsagePanel from './UsagePanel';
import ModelPicker from './ModelPicker';
import { DEFAULT_MODEL_ID, getModelById } from '../constants/models';

const DEFAULT_MODEL_STORAGE_KEY = 'personahub:defaultModelId';

const DEFAULT_PREFS: UserPreferences = {
  id: '',
  userId: '',
  globalKeyboardShortcut: 'CmdOrCtrl+Shift+P',
  startOnLogin: true,
  notificationsEnabled: true,
  theme: 'dark',
  backupRetentionDays: 30,
  maxBackups: 100,
};

type TabId = 'general' | 'ai' | 'voice' | 'advanced';

export default function Settings() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [appVersion, setAppVersion] = useState('');
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('general');

  // Default-model preference (stored in localStorage — read by ChatSidebar
  // when creating new personas so they inherit this choice).
  const [defaultModelId, setDefaultModelId] = useState<string>(() => {
    try {
      return localStorage.getItem(DEFAULT_MODEL_STORAGE_KEY) || DEFAULT_MODEL_ID;
    } catch {
      return DEFAULT_MODEL_ID;
    }
  });

  // Voice & Avatar state
  const [voicePrefs, setVoicePrefs] = useState<GlobalVoicePrefs>({
    voiceOutputEnabled: false,
    voiceInputEnabled: false,
    defaultProvider: 'os-native',
    captionsEnabled: true,
    defaultAvatarStyle: 'face-warm',
    reducedMotionOverride: 'auto',
    localOnlyMode: false,
    autoStopOnBlur: true,
    monthlySpendCeiling: {},
    featureFlag: true,
  });
  const [voiceKeyStatus, setVoiceKeyStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadPrefs();
    loadVoicePrefs();
    window.electronAPI?.app.getVersion().then(setAppVersion).catch(() => {});
  }, []);

  async function loadVoicePrefs() {
    try {
      const vp = await window.electronAPI.voice.getPrefs();
      setVoicePrefs(vp);
      for (const provider of ['cloud-openai', 'cloud-elevenlabs', 'cloud-google'] as const) {
        const present = await window.electronAPI.voice.hasKey(provider);
        setVoiceKeyStatus((prev) => ({ ...prev, [provider]: present }));
      }
    } catch (err) {
      console.warn('[Settings] Failed to load voice prefs:', err);
    }
  }

  async function saveVoicePrefs(updates: Partial<GlobalVoicePrefs>) {
    const updated = { ...voicePrefs, ...updates };
    setVoicePrefs(updated);
    try {
      await window.electronAPI.voice.setPrefs(updates);
      // Broadcast so ChatWindow (and any other listener) reacts without
      // needing to be re-mounted via a view switch.
      window.dispatchEvent(new CustomEvent('voice-prefs-changed', { detail: updated }));
      flashSaved();
    } catch (err) {
      console.error('[Settings] Failed to save voice prefs:', err);
    }
  }

  async function loadPrefs() {
    try {
      const loaded = await window.electronAPI.prefs.load();
      setPrefs(loaded);
    } catch (err) {
      console.warn('[Settings] Failed to load preferences:', err);
    }
  }

  async function savePrefs(updated: UserPreferences) {
    setPrefs(updated);
    try {
      await window.electronAPI.prefs.save({
        globalKeyboardShortcut: updated.globalKeyboardShortcut,
        startOnLogin: updated.startOnLogin,
        notificationsEnabled: updated.notificationsEnabled,
        theme: updated.theme,
        backupRetentionDays: updated.backupRetentionDays,
        maxBackups: updated.maxBackups,
      });
      // Broadcast so `useTheme()` (and anything else that consumes user
      // prefs live) can update without an app restart. Mirrors the
      // `voice-prefs-changed` pattern already used for the voice section.
      window.dispatchEvent(new CustomEvent('prefs-changed', { detail: updated }));
      flashSaved();
    } catch (err) {
      console.error('[Settings] Failed to save preferences:', err);
    }
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function saveDefaultModel(modelId: string) {
    setDefaultModelId(modelId);
    try {
      localStorage.setItem(DEFAULT_MODEL_STORAGE_KEY, modelId);
      flashSaved();
    } catch (err) {
      console.warn('[Settings] Failed to save default model:', err);
    }
  }

  const handleSignOut = async () => {
    try {
      await window.electronAPI.auth.logout();
    } catch {
      /* fall through — reload regardless */
    }
    window.location.reload();
  };

  const currentDefaultModel = getModelById(defaultModelId);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Personalize PersonaHub — appearance, AI models, voice, and data.
          </p>
        </header>

        {/* Tab navigation */}
        <nav className="flex gap-1 border-b border-gray-800 mb-6 overflow-x-auto">
          {[
            { id: 'general' as TabId, label: 'General', icon: '⚙' },
            { id: 'ai' as TabId, label: 'AI & Models', icon: '✨' },
            { id: 'voice' as TabId, label: 'Voice & Avatar', icon: '🎙' },
            { id: 'advanced' as TabId, label: 'Advanced', icon: '🛠' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap
                ${activeTab === tab.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <span className="mr-1.5 opacity-70">{tab.icon}</span>
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t" />
              )}
            </button>
          ))}
        </nav>

        {/* ─── General tab ─── */}
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Appearance" icon="🎨">
              <Label>Theme</Label>
              {/* QA finding UI4: Light mode was a dead toggle — the chrome is
                  hard-coded to the dark palette. Offer only Dark + System
                  until a proper light skin lands. */}
              <div className="grid grid-cols-2 gap-2">
                {(['dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => savePrefs({ ...prefs, theme: t })}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium capitalize transition-all border
                      ${prefs.theme === t
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-900/30'
                        : 'bg-gray-800/60 text-gray-400 border-gray-700 hover:bg-gray-800 hover:border-gray-600'
                      }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Card>

            <Card title="Keyboard Shortcut" icon="⌨">
              <Label>Global toggle — show/hide PersonaHub anywhere</Label>
              <ShortcutCapture
                value={prefs.globalKeyboardShortcut}
                onChange={(accelerator) =>
                  savePrefs({ ...prefs, globalKeyboardShortcut: accelerator })
                }
              />
              <p className="text-[11px] text-gray-500 mt-2">
                Click the field and press the key combo you want. Saves instantly.
              </p>
            </Card>

            <Card title="Startup" icon="🚀">
              <ToggleRow
                label="Start on login"
                description="Launch PersonaHub when your computer starts"
                checked={prefs.startOnLogin}
                onChange={(v) => savePrefs({ ...prefs, startOnLogin: v })}
              />
            </Card>

            <Card title="Account" icon="👤" variant="danger">
              <p className="text-xs text-gray-500 mb-3">
                Signing out clears your session. Personas stay on this device.
              </p>
              <button
                onClick={handleSignOut}
                className="w-full py-2.5 border border-red-800/60 bg-red-950/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-900/30 hover:border-red-700 transition-colors"
              >
                Sign Out
              </button>
            </Card>
          </div>
        )}

        {/* ─── AI & Models tab ─── */}
        {activeTab === 'ai' && (
          <div className="space-y-4">
            <Card title="Usage This Month" icon="📊" accent>
              <UsagePanel />
            </Card>

            <Card title="Default AI Model" icon="✨">
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                Used for all newly created personas. You can always change the model per-persona
                by clicking the pencil icon on any persona in the sidebar.
              </p>

              {currentDefaultModel && (
                <div className="mb-4 p-3 bg-indigo-950/30 border border-indigo-800/40 rounded-lg flex items-center gap-3">
                  <span className="text-2xl">{currentDefaultModel.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">
                      Currently: {currentDefaultModel.label}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {currentDefaultModel.tagline}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-400 shrink-0">DEFAULT</span>
                </div>
              )}

              <ModelPicker value={defaultModelId} onChange={saveDefaultModel} />
            </Card>
          </div>
        )}

        {/* ─── Voice & Avatar tab ─── */}
        {activeTab === 'voice' && (
          <div className="space-y-4">
            <Card title="Voice Output" icon="🔊">
              <ToggleRow
                label="Voice output"
                description="Personas speak their replies aloud"
                checked={voicePrefs.voiceOutputEnabled}
                onChange={(v) => saveVoicePrefs({ voiceOutputEnabled: v })}
              />
              {voicePrefs.voiceOutputEnabled && (
                <div className="mt-2 pt-3 border-t border-gray-800/60 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Default provider</Label>
                      <select
                        value={voicePrefs.defaultProvider}
                        onChange={(e) => saveVoicePrefs({ defaultProvider: e.target.value as VoiceProvider })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="os-native">OS Native (free)</option>
                        <option value="cloud-openai">OpenAI TTS</option>
                        <option value="cloud-elevenlabs">ElevenLabs</option>
                        <option value="cloud-google">Google TTS</option>
                        <option value="auto">Auto (best available)</option>
                      </select>
                    </div>
                    <div>
                      <Label>Voice speed · {(voicePrefs.defaultSpeed ?? 1.0).toFixed(1)}x</Label>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value={voicePrefs.defaultSpeed ?? 1.0}
                        onChange={(e) => saveVoicePrefs({ defaultSpeed: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Captions & Avatar" icon="💬">
              <ToggleRow
                label="Captions"
                description="Show text captions below the avatar"
                checked={voicePrefs.captionsEnabled}
                onChange={(v) => saveVoicePrefs({ captionsEnabled: v })}
              />
              <ToggleRow
                label="Animated avatar face"
                description="Show 2D face for each persona"
                checked={voicePrefs.featureFlag}
                onChange={(v) => saveVoicePrefs({ featureFlag: v })}
              />
              {voicePrefs.featureFlag && (
                <div className="mt-3 pt-3 border-t border-gray-800/60">
                  <Label>Default face style</Label>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {(['face-warm', 'face-cool', 'face-playful', 'face-serious', 'face-gentle', 'face-bold'] as AvatarStyleId[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => saveVoicePrefs({ defaultAvatarStyle: s })}
                        className={`px-2 py-2 rounded-lg text-xs capitalize transition-all border
                          ${voicePrefs.defaultAvatarStyle === s
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-900/30'
                            : 'bg-gray-800/60 text-gray-400 border-gray-700 hover:bg-gray-800 hover:border-gray-600'
                          }`}
                      >
                        {s.replace('face-', '')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card title="API Keys" icon="🔑">
              <p className="text-xs text-gray-500 mb-3">
                Stored encrypted in your OS keychain. Used for cloud TTS providers.
              </p>
              <div className="space-y-1">
                {(['cloud-openai', 'cloud-elevenlabs', 'cloud-google'] as const).map((provider) => (
                  <div key={provider} className="flex items-center justify-between py-2 px-3 bg-gray-800/40 rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${voiceKeyStatus[provider] ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                      <div className="min-w-0">
                        <div className="text-sm text-white capitalize">{provider.replace('cloud-', '')}</div>
                        <div className="text-[10px] text-gray-500">
                          {voiceKeyStatus[provider] ? 'Key stored securely' : 'Not configured'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        if (voiceKeyStatus[provider]) {
                          await window.electronAPI.voice.deleteKey(provider);
                          setVoiceKeyStatus((prev) => ({ ...prev, [provider]: false }));
                        } else {
                          const key = prompt(`Enter ${provider.replace('cloud-', '')} API key:`);
                          if (key) {
                            await window.electronAPI.voice.storeKey(provider, key);
                            setVoiceKeyStatus((prev) => ({ ...prev, [provider]: true }));
                          }
                        }
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
                        voiceKeyStatus[provider]
                          ? 'text-red-400 hover:bg-red-900/20 border border-red-900/40'
                          : 'text-indigo-400 hover:bg-indigo-900/20 border border-indigo-900/40'
                      }`}
                    >
                      {voiceKeyStatus[provider] ? 'Remove' : 'Add key'}
                    </button>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Privacy & Diagnostics" icon="🛡">
              <ToggleRow
                label="Local-only mode"
                description="Never send voice data to cloud providers"
                checked={voicePrefs.localOnlyMode}
                onChange={(v) => saveVoicePrefs({ localOnlyMode: v })}
              />
              <button
                onClick={async () => {
                  try {
                    const results = await window.electronAPI.voice.runDiagnostics();
                    toast.success(
                      results.map((r: { stage: string; status: string }) => `${r.stage}: ${r.status}`).join('\n'),
                      { duration: 5000 },
                    );
                  } catch (err) {
                    toast.error('Diagnostics failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
                  }
                }}
                className="w-full mt-3 py-2.5 border border-gray-700 bg-gray-800/40 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Run Diagnostics
              </button>
            </Card>
          </div>
        )}

        {/* ─── Advanced tab ─── */}
        {activeTab === 'advanced' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="About" icon="ℹ">
              <div className="text-center py-4">
                <div className="text-3xl mb-2">🪄</div>
                <div className="text-sm font-medium text-white">PersonaHub Desktop</div>
                <div className="text-xs text-gray-500 mt-1">Version {appVersion || 'dev'}</div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Saved toast */}
      {saved && (
        <div className="fixed bottom-6 right-6 bg-emerald-900/90 border border-emerald-700 text-emerald-200 text-sm px-4 py-2.5 rounded-lg shadow-2xl backdrop-blur flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Settings saved
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────

function Card({
  title,
  icon,
  children,
  accent,
  variant,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  accent?: boolean;
  variant?: 'danger';
}) {
  const borderClass =
    variant === 'danger' ? 'border-red-900/40' : accent ? 'border-indigo-800/40' : 'border-gray-800';
  const bgClass =
    variant === 'danger'
      ? 'bg-red-950/10'
      : accent
      ? 'bg-gradient-to-br from-indigo-950/30 to-gray-900/60'
      : 'bg-gray-900/60';

  return (
    <section className={`rounded-xl border ${borderClass} ${bgClass} p-5 backdrop-blur`}>
      <header className="flex items-center gap-2 mb-4">
        {icon && <span className="text-base opacity-80">{icon}</span>}
        <h2 className="text-sm font-semibold text-white tracking-tight">{title}</h2>
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="min-w-0 mr-3">
        <div className="text-sm text-white">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
          checked ? 'bg-indigo-600' : 'bg-gray-700'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Keyboard-shortcut capture field.
 *
 * Click it, press a key combo, it saves. Uses Electron's accelerator string
 * format (e.g. `CmdOrCtrl+Shift+P`). Shows the current binding as a kbd
 * pill when not in capture mode.
 */
function ShortcutCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (accelerator: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;

    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      // Ignore modifier-only presses — wait for a real key.
      if (['Control', 'Meta', 'Shift', 'Alt', 'OS', 'Hyper'].includes(e.key)) return;
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }

      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      // Normalize key — letter keys to uppercase, arrows + common keys kept as-is.
      let key = e.key;
      if (/^[a-z]$/.test(key)) key = key.toUpperCase();
      if (key === ' ') key = 'Space';
      parts.push(key);

      // Require at least one modifier to avoid hijacking single letters globally.
      if (parts.length < 2) return;

      const accel = parts.join('+');
      onChange(accel);
      setCapturing(false);
    }

    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [capturing, onChange]);

  return (
    <button
      type="button"
      onClick={() => setCapturing((c) => !c)}
      className={`w-full text-left px-3 py-2 rounded-lg border text-sm font-mono transition-colors ${
        capturing
          ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200 animate-pulse'
          : 'bg-gray-800 border-gray-700 text-gray-200 hover:border-gray-600'
      }`}
      title={capturing ? 'Press any key combination…' : 'Click to change'}
    >
      {capturing ? 'Press your shortcut…' : value}
    </button>
  );
}
