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
      await window.electronAPI.agent.ensureDefault();
    } catch (err) {
      console.error('Failed to ensure default persona:', err);
    }
  }

  // On mount, check if OpenClaw is already installed.
  // Retry with exponential backoff (0.3s → 0.6s → 1.2s → 2.4s → 4.8s, ~9s total)
  // because Vite hot-reload can start the renderer before the main process
  // finishes registering IPC handlers. The old 3×1.5s fixed-gap loop would give
  // up too early on a slow launch and falsely render the wizard over a valid config.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const delays = [300, 600, 1200, 2400, 4800];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelled) return;
        try {
          const installed = await window.electronAPI.openclaw.checkInstalled();
          if (installed) {
            try { await ensureDefaultPersona(); } catch (e) { console.error('Default persona error:', e); }
            if (!cancelled) {
              setReady(true);
              setChecking(false);
            }
            return;
          }
          // IPC responded with `false` → config genuinely absent, stop retrying.
          break;
        } catch (err) {
          console.error(`OpenClaw check attempt ${attempt + 1} failed:`, err);
        }
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
      if (!cancelled) setChecking(false);
    }
    check();
    return () => { cancelled = true; };
  }, []);

  // Called after setup wizard finishes installing OpenClaw
  async function handleSetupComplete() {
    await ensureDefaultPersona();
    setReady(true);
  }

  // Branded splash while checking (replaces the old black flash).
  if (checking) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-b from-gray-950 via-gray-950 to-indigo-950/40 text-white animate-[fadeIn_.3s_ease-out]">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl shadow-[0_0_40px_rgba(99,102,241,0.35)]">
            <span aria-hidden>✨</span>
          </div>
          <div className="absolute -inset-3 rounded-3xl border border-indigo-400/30 animate-ping" />
        </div>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">PersonaHub</h1>
        <p className="mt-1 text-sm text-gray-400">Starting…</p>
      </div>
    );
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
