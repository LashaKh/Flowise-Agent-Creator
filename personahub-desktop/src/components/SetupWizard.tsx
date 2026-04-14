import { useState, useEffect } from 'react';

interface SetupWizardProps {
  onComplete: () => void;
}

type WizardStep = 'apikey' | 'installing';

interface ExistingDetection {
  provider: 'anthropic' | 'google' | null;
  keyPreview: string | null;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('apikey');
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<'anthropic' | 'google'>('google');
  const [installError, setInstallError] = useState<string | null>(null);

  return (
    <div className="relative flex items-center justify-center h-screen bg-gray-950 overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-[50%] -translate-x-1/2 h-[420px] w-[680px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[30%] h-[320px] w-[520px] rounded-full bg-purple-600/15 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-lg mx-4 animate-[fadeIn_.4s_ease-out]">
        <div key={step}>
          {step === 'apikey' && (
            <ApiKeyStep
              apiKey={apiKey}
              provider={provider}
              onApiKeyChange={setApiKey}
              onProviderChange={setProvider}
              onNext={() => setStep('installing')}
              onContinueExisting={onComplete}
            />
          )}
          {step === 'installing' && (
            <InstallingStep
              apiKey={apiKey}
              provider={provider}
              error={installError}
              onError={setInstallError}
              onComplete={onComplete}
              onBack={() => {
                setInstallError(null);
                setStep('apikey');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: API Key (detected vs fresh sub-states) ──

function ApiKeyStep({
  apiKey,
  provider,
  onApiKeyChange,
  onProviderChange,
  onNext,
  onContinueExisting,
}: {
  apiKey: string;
  provider: 'anthropic' | 'google';
  onApiKeyChange: (key: string) => void;
  onProviderChange: (p: 'anthropic' | 'google') => void;
  onNext: () => void;
  onContinueExisting: () => void;
}) {
  const [detection, setDetection] = useState<ExistingDetection | null>(null);
  const [detectionLoading, setDetectionLoading] = useState(true);
  const [overrideExisting, setOverrideExisting] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    async function detect() {
      try {
        const result = await window.electronAPI?.openclaw.detectExisting();
        if (result) setDetection(result);
      } catch (err) {
        console.error('detectExisting failed:', err);
      } finally {
        setDetectionLoading(false);
      }
    }
    detect();
  }, []);

  // State A: detected existing key → Welcome back
  if (!detectionLoading && detection?.provider && !overrideExisting) {
    const providerLabel = detection.provider === 'anthropic' ? 'Anthropic Claude' : 'Google Gemini';
    return (
      <div className="space-y-6 bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <Header title="Welcome back" subtitle="Your API key is already configured." />

        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <div className="h-9 w-9 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">
            ✓
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{providerLabel} detected</p>
            <p className="text-xs text-gray-400 font-mono truncate">{detection.keyPreview ?? '••••'}</p>
          </div>
        </div>

        <button
          onClick={onContinueExisting}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/30"
        >
          Continue →
        </button>

        <button
          onClick={() => setOverrideExisting(true)}
          className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Use a different key
        </button>
      </div>
    );
  }

  // State B: fresh setup — provider cards + live validation
  const isValidFormat = apiKey.trim().length > 0 && (
    provider === 'anthropic' ? apiKey.trim().startsWith('sk-ant-') : apiKey.trim().startsWith('AIza')
  );
  const showFormatWarning = apiKey.trim().length > 8 && !isValidFormat;

  return (
    <div className="space-y-6 bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 shadow-2xl">
      <Header
        title="Welcome to PersonaHub"
        subtitle="Pick a provider and paste your API key to get started."
      />

      <div className="grid grid-cols-2 gap-3">
        <ProviderCard
          selected={provider === 'google'}
          onClick={() => onProviderChange('google')}
          logo="G"
          logoClass="bg-gradient-to-br from-blue-500 to-green-500"
          name="Google Gemini"
          tagline="Free tier · Fast"
        />
        <ProviderCard
          selected={provider === 'anthropic'}
          onClick={() => onProviderChange('anthropic')}
          logo="C"
          logoClass="bg-gradient-to-br from-orange-400 to-amber-600"
          name="Anthropic Claude"
          tagline="Best quality"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">API Key</label>
        <div className="relative">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'AIza...'}
            className={`w-full bg-gray-950 border rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none transition-colors ${
              showFormatWarning
                ? 'border-amber-500/60 focus:border-amber-500'
                : isValidFormat
                ? 'border-emerald-500/60 focus:border-emerald-500'
                : 'border-gray-800 focus:border-indigo-500'
            }`}
          />
          {isValidFormat && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-sm">✓</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {provider === 'anthropic' ? (
              <>Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">console.anthropic.com</a></>
            ) : (
              <>Get a key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">aistudio.google.com</a></>
            )}
          </p>
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Why?
          </button>
        </div>
        {showFormatWarning && (
          <p className="text-xs text-amber-400">
            That doesn't look like a {provider === 'anthropic' ? 'Claude' : 'Gemini'} key. Expected it to start with
            <span className="font-mono"> {provider === 'anthropic' ? 'sk-ant-' : 'AIza'}</span>.
          </p>
        )}
        {showWhy && (
          <div className="text-xs text-gray-400 bg-gray-950/50 border border-gray-800 rounded-lg p-3 leading-relaxed">
            PersonaHub runs a local AI gateway on your machine and sends your chat messages to
            {provider === 'anthropic' ? ' Anthropic' : ' Google'} using this key. The key is stored only on this device
            and never leaves your computer except to call the model provider directly.
          </div>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!apiKey.trim()}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/30"
      >
        Get Started
      </button>

      {overrideExisting && detection?.provider && (
        <button
          onClick={() => setOverrideExisting(false)}
          className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Keep using existing {detection.provider === 'anthropic' ? 'Claude' : 'Gemini'} key
        </button>
      )}
    </div>
  );
}

// ─── Step 2: Starting AI Engine (progressive messages) ─────────────

function InstallingStep({
  apiKey,
  provider,
  error,
  onError,
  onComplete,
  onBack,
}: {
  apiKey: string;
  provider: 'anthropic' | 'google';
  error: string | null;
  onError: (err: string | null) => void;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState(0);

  const phases = [
    'Saving configuration…',
    'Starting AI engine…',
    'Almost ready…',
  ];

  async function startEngine() {
    onError(null);
    try {
      await window.electronAPI?.openclaw.install(apiKey, provider);
      onComplete();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to start AI engine');
    }
  }

  useEffect(() => {
    startEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (error) return;
    const t = setInterval(() => {
      setPhase((p) => Math.min(p + 1, phases.length - 1));
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, attempt]);

  return (
    <div className="space-y-6 bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 shadow-2xl">
      <Header
        title={error ? 'Setup failed' : 'Setting up'}
        subtitle={error ? 'Something went wrong while starting the AI engine.' : (phases[phase] ?? phases[0]!)}
      />

      {error ? (
        <div className="space-y-3">
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3 font-mono whitespace-pre-wrap break-words">
            {error}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onBack}
              className="flex-1 py-3 border border-gray-700 text-gray-300 rounded-xl font-medium hover:bg-gray-900 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => { setPhase(0); setAttempt((n) => n + 1); }}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-500 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-gray-800" />
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
          <div className="flex gap-1.5">
            {phases.map((_, i) => (
              <div
                key={i}
                className={`h-1 w-8 rounded-full transition-colors ${
                  i <= phase ? 'bg-indigo-500' : 'bg-gray-800'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Presentational helpers ─────────────

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center space-y-2">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl shadow-lg shadow-indigo-600/30">
        <span aria-hidden>✨</span>
      </div>
      <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
      <p className="text-sm text-gray-400">{subtitle}</p>
    </div>
  );
}

function ProviderCard({
  selected,
  onClick,
  logo,
  logoClass,
  name,
  tagline,
}: {
  selected: boolean;
  onClick: () => void;
  logo: string;
  logoClass: string;
  name: string;
  tagline: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30'
          : 'border-gray-800 bg-gray-950/50 hover:border-gray-700 hover:bg-gray-900/50'
      }`}
    >
      <div className={`h-9 w-9 rounded-lg ${logoClass} flex items-center justify-center text-white font-bold text-sm mb-3`}>
        {logo}
      </div>
      <div className="text-sm font-medium text-white">{name}</div>
      <div className="text-xs text-gray-400 mt-0.5">{tagline}</div>
      {selected && (
        <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs">
          ✓
        </div>
      )}
    </button>
  );
}
