import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import ChatWindow from './components/ChatWindow';
import ActivityLog from './components/ActivityLog';
import Settings from './components/Settings';
import SetupWizard from './components/SetupWizard';

type AppView = 'chat' | 'activity' | 'settings';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('chat');
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  // Ensure at least one persona exists so the user always has something to chat with
  async function ensureDefaultPersona() {
    try {
      const rows = await window.electronAPI.db.all(
        `SELECT id FROM persona_configs WHERE status = 'active' LIMIT 1`,
        []
      );
      if (rows.length === 0) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await window.electronAPI.db.run(
          `INSERT OR IGNORE INTO persona_configs (id, name, system_prompt, status, confirmation_level, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, 'Assistant', 'You are a helpful AI assistant.', 'active', 'balanced', now, now]
        );
      }
    } catch (err) {
      console.error('Failed to ensure default persona:', err);
    }
  }

  // On mount, check if OpenClaw is already installed (retry up to 3 times
  // because Vite hot-reload can start the renderer before the main process
  // finishes registering IPC handlers)
  useEffect(() => {
    async function check() {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const installed = await window.electronAPI.openclaw.checkInstalled();
          if (installed) {
            try { await ensureDefaultPersona(); } catch (e) { console.error('Default persona error:', e); }
            setReady(true);
            setChecking(false);
            return;
          }
        } catch (err) {
          console.error(`OpenClaw check attempt ${attempt + 1} failed:`, err);
        }
        // Wait before retrying (main process may still be initializing)
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
      }
      setChecking(false);
    }
    check();
  }, []);

  // Called after setup wizard finishes installing OpenClaw
  async function handleSetupComplete() {
    await ensureDefaultPersona();
    setReady(true);
  }

  // Show nothing while checking
  if (checking) {
    return <div className="h-screen bg-gray-950" />;
  }

  // Show setup wizard if OpenClaw isn't installed yet
  if (!ready) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Navigation sidebar */}
      <nav className="w-14 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-4 gap-2">
        <NavButton
          icon="💬"
          label="Chat"
          active={activeView === 'chat'}
          onClick={() => setActiveView('chat')}
        />
        <NavButton
          icon="📋"
          label="Activity"
          active={activeView === 'activity'}
          onClick={() => setActiveView('activity')}
        />
        <NavButton
          icon="⚙️"
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => setActiveView('settings')}
        />
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {activeView === 'chat' && <ChatWindow />}
        {activeView === 'activity' && <ActivityLog />}
        {activeView === 'settings' && <Settings />}
      </main>

      <Toaster position="bottom-right" />
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      {icon}
    </button>
  );
}
