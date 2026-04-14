import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import type { UserPreferences, GlobalVoicePrefs, VoiceProvider, AvatarStyleId } from '../types';
import { clearAllSessionCache } from '../hooks/useChat';
import UsagePanel from './UsagePanel';

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

export default function Settings() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [appVersion, setAppVersion] = useState('');
  const [saved, setSaved] = useState(false);

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
      // Check which providers have keys (typed hasKey — returns boolean, not the key)
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
    setSaved(false);
    try {
      await window.electronAPI.prefs.save({
        globalKeyboardShortcut: updated.globalKeyboardShortcut,
        startOnLogin: updated.startOnLogin,
        notificationsEnabled: updated.notificationsEnabled,
        theme: updated.theme,
        backupRetentionDays: updated.backupRetentionDays,
        maxBackups: updated.maxBackups,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('[Settings] Failed to save preferences:', err);
    }
  }

  const handleSignOut = async () => {
    try {
      // Clear the chat session cache first so stale session IDs don't leak
      // across users if a different user signs in next (audit P4-E-4).
      clearAllSessionCache();
      await window.electronAPI.auth.logout();
      window.location.reload();
    } catch {
      clearAllSessionCache();
      window.location.reload();
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto p-6 space-y-6">
        <h1 className="text-xl font-semibold text-white">Settings</h1>

        {/* Theme */}
        <Section title="Appearance">
          <label className="text-sm text-gray-400 mb-2 block">Theme</label>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => savePrefs({ ...prefs, theme: t })}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  prefs.theme === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Section>

        {/* Keyboard shortcut */}
        <Section title="Keyboard Shortcut">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Global shortcut</span>
            <kbd className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300 font-mono">
              {prefs.globalKeyboardShortcut}
            </kbd>
          </div>
        </Section>

        {/* Toggles */}
        <Section title="General">
          <ToggleRow
            label="Start on login"
            description="Launch PersonaHub when your computer starts"
            checked={prefs.startOnLogin}
            onChange={(v) => savePrefs({ ...prefs, startOnLogin: v })}
          />
          <ToggleRow
            label="Notifications"
            description="Show desktop notifications for persona activity"
            checked={prefs.notificationsEnabled}
            onChange={(v) => savePrefs({ ...prefs, notificationsEnabled: v })}
          />
        </Section>

        {/* AI Usage — cost dashboard for OpenRouter spend */}
        <Section title="AI Usage">
          <UsagePanel />
        </Section>

        {/* Backup config */}
        <Section title="Backups">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-white block">Retention</span>
                <span className="text-xs text-gray-500">Days to keep backups</span>
              </div>
              <input
                type="number"
                min={1}
                max={365}
                value={prefs.backupRetentionDays}
                onChange={(e) =>
                  savePrefs({ ...prefs, backupRetentionDays: Math.max(1, parseInt(e.target.value) || 30) })
                }
                className="w-20 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white text-right focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-white block">Max backups</span>
                <span className="text-xs text-gray-500">Maximum number of backups to keep</span>
              </div>
              <input
                type="number"
                min={10}
                max={10000}
                value={prefs.maxBackups}
                onChange={(e) =>
                  savePrefs({ ...prefs, maxBackups: Math.max(10, parseInt(e.target.value) || 100) })
                }
                className="w-20 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white text-right focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </Section>

        {/* Voice & Avatar */}
        <CollapsibleSection title="Voice & Avatar" defaultOpen={false}>
          {/* Output */}
          <ToggleRow
            label="Voice output"
            description="Personas speak their replies aloud"
            checked={voicePrefs.voiceOutputEnabled}
            onChange={(v) => saveVoicePrefs({ voiceOutputEnabled: v })}
          />
          {voicePrefs.voiceOutputEnabled && (
            <div className="space-y-3 pl-2 border-l-2 border-gray-800 ml-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Default provider</span>
                <select
                  value={voicePrefs.defaultProvider}
                  onChange={(e) => saveVoicePrefs({ defaultProvider: e.target.value as VoiceProvider })}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="os-native">OS Native (free)</option>
                  <option value="cloud-openai">OpenAI TTS</option>
                  <option value="cloud-elevenlabs">ElevenLabs</option>
                  <option value="cloud-google">Google TTS</option>
                  <option value="auto">Auto (best available)</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Voice speed</span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={voicePrefs.defaultSpeed ?? 1.0}
                    className="w-24"
                    onChange={(e) => saveVoicePrefs({ defaultSpeed: parseFloat(e.target.value) })}
                  />
                  <span className="text-xs text-gray-500 w-8">
                    {(voicePrefs.defaultSpeed ?? 1.0).toFixed(1)}x
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Captions */}
          <ToggleRow
            label="Captions"
            description="Show text captions below the avatar"
            checked={voicePrefs.captionsEnabled}
            onChange={(v) => saveVoicePrefs({ captionsEnabled: v })}
          />

          {/* Face */}
          <ToggleRow
            label="Avatar face"
            description="Show animated 2D face for each persona"
            checked={voicePrefs.featureFlag}
            onChange={(v) => saveVoicePrefs({ featureFlag: v })}
          />
          {voicePrefs.featureFlag && (
            <div className="pl-2 border-l-2 border-gray-800 ml-2">
              <label className="text-xs text-gray-500 block mb-2">Default style</label>
              <div className="grid grid-cols-3 gap-2">
                {(['face-warm', 'face-cool', 'face-playful', 'face-serious', 'face-gentle', 'face-bold'] as AvatarStyleId[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => saveVoicePrefs({ defaultAvatarStyle: s })}
                    className={`px-2 py-1.5 rounded text-xs capitalize transition-colors ${
                      voicePrefs.defaultAvatarStyle === s
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {s.replace('face-', '')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Providers & Keys */}
          <div className="pt-2 border-t border-gray-800 mt-2">
            <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">API Keys</h3>
            {(['cloud-openai', 'cloud-elevenlabs', 'cloud-google'] as const).map((provider) => (
              <div key={provider} className="flex items-center justify-between py-1.5">
                <div>
                  <span className="text-sm text-white block capitalize">
                    {provider.replace('cloud-', '')}
                  </span>
                  <span className="text-xs text-gray-500">
                    {voiceKeyStatus[provider] ? '● Key stored' : '○ No key'}
                  </span>
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
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    voiceKeyStatus[provider]
                      ? 'text-red-400 hover:bg-red-900/20'
                      : 'text-indigo-400 hover:bg-indigo-900/20'
                  }`}
                >
                  {voiceKeyStatus[provider] ? 'Remove' : 'Add key'}
                </button>
              </div>
            ))}
          </div>

          {/* Privacy */}
          <div className="pt-2 border-t border-gray-800 mt-2">
            <ToggleRow
              label="Local-only mode"
              description="Never send voice data to cloud providers"
              checked={voicePrefs.localOnlyMode}
              onChange={(v) => saveVoicePrefs({ localOnlyMode: v })}
            />
            <ToggleRow
              label="Auto-stop on blur"
              description="Stop mic when app loses focus"
              checked={voicePrefs.autoStopOnBlur}
              onChange={(v) => saveVoicePrefs({ autoStopOnBlur: v })}
            />
            <p className="text-xs text-gray-600 mt-2">
              Voice audio is never saved to disk. Transcriptions are discarded after insertion.
              API keys are stored in your OS secure credential store.
            </p>
          </div>

          {/* Diagnostics */}
          <button
            onClick={async () => {
              try {
                const results = await window.electronAPI.voice.runDiagnostics();
                toast.success(results.map((r: { stage: string; status: string }) => `${r.stage}: ${r.status}`).join('\n'), { duration: 5000 });
              } catch (err) {
                toast.error('Diagnostics failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
              }
            }}
            className="w-full py-2 mt-2 border border-gray-700 text-gray-400 rounded text-sm hover:bg-gray-800 transition-colors"
          >
            Run Diagnostics
          </button>
        </CollapsibleSection>

        {/* Account */}
        <Section title="Account">
          <button
            onClick={handleSignOut}
            className="w-full py-2.5 border border-red-800 text-red-400 rounded-lg text-sm font-medium hover:bg-red-900/20 transition-colors"
          >
            Sign Out
          </button>
        </Section>

        {/* Version */}
        <p className="text-xs text-gray-600 text-center pt-4">
          PersonaHub Desktop {appVersion || 'dev'}
        </p>

        {saved && (
          <div className="fixed bottom-6 right-6 bg-green-900/80 text-green-300 text-sm px-4 py-2 rounded-lg">
            Settings saved
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
      {children}
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const storageKey = `settings-section-${title.toLowerCase().replace(/\s+/g, '-')}`;
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored !== null ? stored === 'true' : defaultOpen;
    } catch { return defaultOpen; }
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* noop */ }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={toggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
      >
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
        <span className="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
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
    <div className="flex items-center justify-between py-1">
      <div>
        <span className="text-sm text-white block">{label}</span>
        <span className="text-xs text-gray-500">{description}</span>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full relative transition-colors ${
          checked ? 'bg-indigo-600' : 'bg-gray-700'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}
