import { useState, useEffect } from 'react';
import type { UserPreferences } from '../types';

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

  useEffect(() => {
    loadPrefs();
    window.electronAPI?.app.getVersion().then(setAppVersion).catch(() => {});
  }, []);

  async function loadPrefs() {
    try {
      const row = (await window.electronAPI.db.get(
        'SELECT * FROM user_preferences LIMIT 1',
        []
      )) as Record<string, unknown> | undefined;

      if (row) {
        setPrefs({
          id: String(row.id ?? ''),
          userId: String(row.user_id ?? ''),
          globalKeyboardShortcut: String(row.global_keyboard_shortcut ?? DEFAULT_PREFS.globalKeyboardShortcut),
          startOnLogin: Boolean(row.start_on_login),
          notificationsEnabled: Boolean(row.notifications_enabled),
          theme: (row.theme as UserPreferences['theme']) ?? 'dark',
          backupRetentionDays: Number(row.backup_retention_days ?? 30),
          maxBackups: Number(row.max_backups ?? 100),
        });
      }
    } catch {
      // Use defaults if DB not available
    }
  }

  async function savePrefs(updated: UserPreferences) {
    setPrefs(updated);
    setSaved(false);
    try {
      await window.electronAPI.db.run(
        `INSERT INTO user_preferences (id, user_id, global_keyboard_shortcut, start_on_login, notifications_enabled, theme, backup_retention_days, max_backups)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           global_keyboard_shortcut = excluded.global_keyboard_shortcut,
           start_on_login = excluded.start_on_login,
           notifications_enabled = excluded.notifications_enabled,
           theme = excluded.theme,
           backup_retention_days = excluded.backup_retention_days,
           max_backups = excluded.max_backups`,
        [
          updated.id || 'default',
          updated.userId || '',
          updated.globalKeyboardShortcut,
          updated.startOnLogin ? 1 : 0,
          updated.notificationsEnabled ? 1 : 0,
          updated.theme,
          updated.backupRetentionDays,
          updated.maxBackups,
        ]
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Silently fail — settings will persist in state for session
    }
  }

  const handleSignOut = async () => {
    try {
      await window.electronAPI.auth.logout();
      window.location.reload();
    } catch {
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
