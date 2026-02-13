import { useState, useEffect } from 'react';
import type { AuthState, PersonaConfig, PathPermission } from '../types';

interface SetupWizardProps {
  onComplete: (authState: AuthState) => void;
}

type WizardStep = 'welcome' | 'apikey' | 'installing' | 'personas' | 'permissions' | 'ready';

interface LocalPersona {
  id: string;
  name: string;
  status: string;
  toolCount: number;
  selected: boolean;
  allowedPaths: PathPermission[];
}

const SUPABASE_URL = 'https://wlvfilxtvqjzwqjhfcdk.supabase.co';

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [authState, setAuthState] = useState<AuthState>({ isAuthenticated: false });
  const [authLoading, setAuthLoading] = useState(false);
  const [personas, setPersonas] = useState<LocalPersona[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'anthropic' | 'google'>('anthropic');
  const [installProgress, setInstallProgress] = useState(0);
  const [installError, setInstallError] = useState<string | null>(null);

  // Listen for OAuth callback
  useEffect(() => {
    window.electronAPI?.auth.onCallback((result) => {
      setAuthLoading(false);
      setAuthState(result);
      if (result.isAuthenticated) {
        setStep('apikey');
      } else if (result.error) {
        setError(result.error);
      }
    });
  }, []);

  // Fetch personas when we reach step 2
  useEffect(() => {
    if (step === 'personas' && authState.accessToken) {
      fetchPersonas(authState.accessToken);
    }
  }, [step, authState.accessToken]);

  async function fetchPersonas(token: string) {
    setFetchLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/personas`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error(`Failed to fetch personas (${res.status})`);
      const data: PersonaConfig[] = await res.json();
      setPersonas(
        data
          .filter((p) => p.status === 'active')
          .map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            toolCount: p.enabledTools?.length ?? 0,
            selected: false,
            allowedPaths: p.allowedPaths ?? [],
          }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personas');
    } finally {
      setFetchLoading(false);
    }
  }

  const handleSignIn = async () => {
    setAuthLoading(true);
    setError(null);
    try {
      // This opens the browser for Google sign-in
      const { startOAuthFlow } = await import('../../electron/auth');
      await startOAuthFlow();
    } catch {
      // In renderer process, use IPC instead
      // The OAuth flow is triggered by the main process through the protocol handler
      // For now, the auth callback listener above handles the result
    }
  };

  const togglePersona = (id: string) => {
    setPersonas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  };

  const selectAll = () => setPersonas((prev) => prev.map((p) => ({ ...p, selected: true })));
  const deselectAll = () => setPersonas((prev) => prev.map((p) => ({ ...p, selected: false })));

  const selectedCount = personas.filter((p) => p.selected).length;

  const addPath = (personaId: string, path: string, mode: 'read' | 'readwrite') => {
    setPersonas((prev) =>
      prev.map((p) => {
        if (p.id !== personaId) return p;
        if (p.allowedPaths.some((ap) => ap.path === path)) return p;
        return { ...p, allowedPaths: [...p.allowedPaths, { path, mode }] };
      })
    );
  };

  const removePath = (personaId: string, path: string) => {
    setPersonas((prev) =>
      prev.map((p) => {
        if (p.id !== personaId) return p;
        return { ...p, allowedPaths: p.allowedPaths.filter((ap) => ap.path !== path) };
      })
    );
  };

  const togglePathMode = (personaId: string, path: string) => {
    setPersonas((prev) =>
      prev.map((p) => {
        if (p.id !== personaId) return p;
        return {
          ...p,
          allowedPaths: p.allowedPaths.map((ap) =>
            ap.path === path
              ? { ...ap, mode: ap.mode === 'read' ? 'readwrite' as const : 'read' as const }
              : ap
          ),
        };
      })
    );
  };

  const handleComplete = () => {
    onComplete(authState);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <div className="w-full max-w-lg mx-4">
        <div key={step}>
          {step === 'welcome' && (
            <WelcomeStep
              loading={authLoading}
              error={error}
              onSignIn={handleSignIn}
            />
          )}
          {step === 'apikey' && (
            <ApiKeyStep
              apiKey={apiKey}
              provider={provider}
              onApiKeyChange={setApiKey}
              onProviderChange={setProvider}
              onNext={() => setStep('installing')}
            />
          )}
          {step === 'installing' && (
            <InstallingStep
              apiKey={apiKey}
              provider={provider}
              progress={installProgress}
              error={installError}
              onProgress={setInstallProgress}
              onError={setInstallError}
              onComplete={() => setStep('personas')}
            />
          )}
          {step === 'personas' && (
            <PersonaSelectStep
              personas={personas}
              loading={fetchLoading}
              error={error}
              selectedCount={selectedCount}
              onToggle={togglePersona}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onNext={() => setStep('permissions')}
            />
          )}
          {step === 'permissions' && (
            <PermissionsStep
              personas={personas.filter((p) => p.selected)}
              onAddPath={addPath}
              onRemovePath={removePath}
              onToggleMode={togglePathMode}
              onBack={() => setStep('personas')}
              onNext={() => setStep('ready')}
            />
          )}
          {step === 'ready' && (
            <ReadyStep
              personas={personas.filter((p) => p.selected)}
              onComplete={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Welcome ─────────────────────────────

function WelcomeStep({
  loading,
  error,
  onSignIn,
}: {
  loading: boolean;
  error: string | null;
  onSignIn: () => void;
}) {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">PersonaHub Desktop</h1>
        <p className="text-gray-400">Welcome! Let's get you set up.</p>
      </div>

      <button
        onClick={onSignIn}
        disabled={loading}
        className="w-full max-w-xs mx-auto flex items-center justify-center gap-3 bg-white text-gray-900 rounded-lg px-6 py-3 font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        )}
        {loading ? 'Signing in...' : 'Sign in with Google'}
      </button>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

// ─── Step 2: API Key ────────────────────────────

function ApiKeyStep({
  apiKey,
  provider,
  onApiKeyChange,
  onProviderChange,
  onNext,
}: {
  apiKey: string;
  provider: 'anthropic' | 'google';
  onApiKeyChange: (key: string) => void;
  onProviderChange: (p: 'anthropic' | 'google') => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-white">AI Provider</h2>
        <p className="text-gray-400 text-sm">Enter your API key to power your personas.</p>
      </div>

      {/* Provider toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => onProviderChange('anthropic')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            provider === 'anthropic'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700'
          }`}
        >
          Anthropic (Claude)
        </button>
        <button
          onClick={() => onProviderChange('google')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            provider === 'google'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-900 text-gray-400 border border-gray-800 hover:border-gray-700'
          }`}
        >
          Google (Gemini)
        </button>
      </div>

      {/* API key input */}
      <div className="space-y-2">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'AIza...'}
          className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <p className="text-xs text-gray-500">
          {provider === 'anthropic' ? (
            <>Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">console.anthropic.com</a></>
          ) : (
            <>Get your key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">aistudio.google.com</a></>
          )}
        </p>
      </div>

      <button
        onClick={onNext}
        disabled={!apiKey.trim()}
        className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
    </div>
  );
}

// ─── Step 3: Installing ─────────────────────────

function InstallingStep({
  apiKey,
  provider,
  progress,
  error,
  onProgress,
  onError,
  onComplete,
}: {
  apiKey: string;
  provider: 'anthropic' | 'google';
  progress: number;
  error: string | null;
  onProgress: (pct: number) => void;
  onError: (err: string | null) => void;
  onComplete: () => void;
}) {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    setStarted(true);
    startInstall();
  }, []);

  async function startInstall() {
    onError(null);
    onProgress(0);
    try {
      window.electronAPI?.openclaw.onProgress((pct) => {
        onProgress(pct);
        if (pct >= 100) {
          onComplete();
        }
      });
      await window.electronAPI?.openclaw.install(apiKey, provider);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Installation failed');
    }
  }

  const statusText = progress < 40
    ? 'Downloading runtime...'
    : progress < 80
    ? 'Installing AI agent...'
    : 'Starting gateway...';

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-white">Setting Up</h2>
        <p className="text-gray-400 text-sm">Installing the AI runtime on your machine.</p>
      </div>

      {error ? (
        <div className="space-y-4">
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button
            onClick={() => { setStarted(false); }}
            className="w-full py-3 border border-gray-700 text-gray-300 rounded-lg font-medium hover:bg-gray-900 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-400 text-center">{statusText}</p>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Select Personas ─────────────────────

function PersonaSelectStep({
  personas,
  loading,
  error,
  selectedCount,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onNext,
}: {
  personas: LocalPersona[];
  loading: boolean;
  error: string | null;
  selectedCount: number;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onNext: () => void;
}) {
  if (loading) {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-xl font-semibold text-white">Loading your personas...</h2>
        <div className="w-8 h-8 border-2 border-gray-600 border-t-indigo-500 rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-white">Select Personas</h2>
        <p className="text-gray-400 text-sm">Choose which personas to activate locally.</p>
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {personas.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          No active personas found. Create one on the web platform first.
        </p>
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <button
              onClick={onSelectAll}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Select All
            </button>
            <span className="text-gray-600">|</span>
            <button
              onClick={onDeselectAll}
              className="text-xs text-gray-400 hover:text-gray-300"
            >
              Deselect All
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => onToggle(p.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
                  p.selected
                    ? 'border-indigo-500 bg-indigo-600/10'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    p.selected
                      ? 'border-indigo-500 bg-indigo-600'
                      : 'border-gray-600'
                  }`}
                >
                  {p.selected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-white truncate block">{p.name}</span>
                  <span className="text-xs text-gray-500">
                    {p.toolCount} tool{p.toolCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 flex-shrink-0">
                  {p.status}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <button
        onClick={onNext}
        disabled={selectedCount === 0}
        className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next ({selectedCount} selected)
      </button>
    </div>
  );
}

// ─── Step 3: Folder Permissions ──────────────────

function PermissionsStep({
  personas,
  onAddPath,
  onRemovePath,
  onToggleMode,
  onBack,
  onNext,
}: {
  personas: LocalPersona[];
  onAddPath: (personaId: string, path: string, mode: 'read' | 'readwrite') => void;
  onRemovePath: (personaId: string, path: string) => void;
  onToggleMode: (personaId: string, path: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-white">Folder Permissions</h2>
        <p className="text-gray-400 text-sm">Set which folders each persona can access.</p>
      </div>

      <div className="space-y-4 max-h-80 overflow-y-auto">
        {personas.map((persona) => (
          <PersonaPathConfig
            key={persona.id}
            persona={persona}
            onAddPath={onAddPath}
            onRemovePath={onRemovePath}
            onToggleMode={onToggleMode}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-3 border border-gray-700 text-gray-300 rounded-lg font-medium hover:bg-gray-900 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function PersonaPathConfig({
  persona,
  onAddPath,
  onRemovePath,
  onToggleMode,
}: {
  persona: LocalPersona;
  onAddPath: (personaId: string, path: string, mode: 'read' | 'readwrite') => void;
  onRemovePath: (personaId: string, path: string) => void;
  onToggleMode: (personaId: string, path: string) => void;
}) {
  const [newPath, setNewPath] = useState('');

  const suggestions = ['~/Documents', '~/Desktop', '~/Downloads'];

  const handleAdd = () => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    onAddPath(persona.id, trimmed, 'read');
    setNewPath('');
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium text-white">{persona.name}</h3>

      {/* Existing paths */}
      {persona.allowedPaths.length > 0 && (
        <div className="space-y-1">
          {persona.allowedPaths.map((ap) => (
            <div
              key={ap.path}
              className="flex items-center gap-2 text-xs bg-gray-800 rounded px-3 py-1.5"
            >
              <span className="text-gray-300 flex-1 truncate font-mono">{ap.path}</span>
              <button
                onClick={() => onToggleMode(persona.id, ap.path)}
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  ap.mode === 'readwrite'
                    ? 'bg-amber-900/50 text-amber-400'
                    : 'bg-blue-900/50 text-blue-400'
                }`}
              >
                {ap.mode === 'readwrite' ? 'Read/Write' : 'Read'}
              </button>
              <button
                onClick={() => onRemovePath(persona.id, ap.path)}
                className="text-gray-500 hover:text-red-400"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new path */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="/path/to/folder"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newPath.trim()}
          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Suggestion buttons */}
      <div className="flex gap-2 flex-wrap">
        {suggestions
          .filter((s) => !persona.allowedPaths.some((ap) => ap.path === s))
          .map((s) => (
            <button
              key={s}
              onClick={() => onAddPath(persona.id, s, 'read')}
              className="text-[11px] px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}

// ─── Step 4: Ready ───────────────────────────────

function ReadyStep({
  personas,
  onComplete,
}: {
  personas: LocalPersona[];
  onComplete: () => void;
}) {
  return (
    <div className="text-center space-y-8">
      <div className="space-y-2">
        <div className="text-4xl mb-4">&#10003;</div>
        <h2 className="text-2xl font-bold text-white">You're all set!</h2>
        <p className="text-gray-400 text-sm">
          {personas.length} persona{personas.length !== 1 ? 's' : ''} ready to chat.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-left space-y-2">
        {personas.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-gray-300">{p.name}</span>
            <span className="text-gray-600 text-xs ml-auto">
              {p.allowedPaths.length} folder{p.allowedPaths.length !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onComplete}
        className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors"
      >
        Start Chatting
      </button>
    </div>
  );
}
