import { useState, useEffect } from 'react';

interface SetupWizardProps {
  onComplete: () => void;
}

type WizardStep = 'apikey' | 'installing';

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('apikey');
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'anthropic' | 'google'>('google');
  const [installProgress, setInstallProgress] = useState(0);
  const [installError, setInstallError] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <div className="w-full max-w-lg mx-4">
        <div key={step}>
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
              onComplete={onComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: API Key ────────────────────────────

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
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-white">PersonaHub Desktop</h1>
        <p className="text-gray-400 text-sm">Enter your API key to get started.</p>
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
        Install & Get Started
      </button>
    </div>
  );
}

// ─── Step 2: Installing ─────────────────────────

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
