import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import SetupWizard from './components/SetupWizard';
import ChatWindow from './components/ChatWindow';
import ActivityLog from './components/ActivityLog';
import Settings from './components/Settings';
import type { AuthState } from './types';

type AppView = 'chat' | 'activity' | 'settings';

export default function App() {
  const [authState, setAuthState] = useState<AuthState>({ isAuthenticated: false });
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<AppView>('chat');

  useEffect(() => {
    // Check if user is already authenticated
    async function checkAuth() {
      try {
        const state = await window.electronAPI.auth.getState();
        setAuthState(state);
        setIsFirstLaunch(!state.isAuthenticated);
      } catch {
        // Running outside Electron (dev mode without electron)
        setIsFirstLaunch(true);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();

    // Listen for auth callbacks from OAuth flow
    window.electronAPI?.auth.onCallback((result) => {
      setAuthState(result as AuthState);
      if ((result as AuthState).isAuthenticated) {
        setIsFirstLaunch(false);
      }
    });

    // Listen for navigation events from tray menu
    window.electronAPI?.sync.onSyncComplete(() => {
      // Trigger re-render when sync completes
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="animate-pulse text-lg">Loading PersonaHub Desktop...</div>
      </div>
    );
  }

  // First launch or not authenticated — show setup wizard
  if (isFirstLaunch || !authState.isAuthenticated) {
    return (
      <>
        <SetupWizard
          onComplete={(state) => {
            setAuthState(state);
            setIsFirstLaunch(false);
          }}
        />
        <Toaster position="bottom-right" />
      </>
    );
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
