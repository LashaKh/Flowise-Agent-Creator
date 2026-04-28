import { useMemo, type ReactNode } from 'react';

type Platform = 'mac' | 'windows' | 'linux';

// Single source of truth for download filenames. Bump this on each release
// AFTER publishing the new GitHub release with matching artifact names.
const APP_VERSION = '0.3.7';

const GITHUB_RELEASE_BASE =
  'https://github.com/LashaKh/Flowise-Agent-Creator/releases/latest/download';

// Mac builds ship for both arm64 (Apple Silicon) and x64 (Intel). The
// primary download is arm64 (most users on new hardware). Intel Mac users
// get a secondary link in the install-note section below.
const MAC_ARM64_FILE = `PersonaHub-Desktop-${APP_VERSION}-arm64.dmg`;
const MAC_X64_FILE = `PersonaHub-Desktop-${APP_VERSION}-x64.dmg`;

const PLATFORMS: {
  id: Platform;
  name: string;
  icon: ReactNode;
  fileName: string;
  ext: string;
  size: string;
  requirements: string;
}[] = [
  {
    id: 'mac',
    name: 'macOS',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    ),
    fileName: MAC_ARM64_FILE,
    ext: '.dmg',
    size: '~120 MB',
    requirements: 'macOS 12 (Monterey) or later — Apple Silicon',
  },
  {
    id: 'windows',
    name: 'Windows',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 12V6.75l6-1.32v6.48L3 12zm17-9v8.75l-10 .15V5.21L20 3zM3 13l6 .09v6.81l-6-1.15V13zm7 .25l10 .15V21l-10-1.91V13.25z" />
      </svg>
    ),
    fileName: `PersonaHub-Desktop-Setup-${APP_VERSION}.exe`,
    ext: '.exe',
    size: '~90 MB',
    requirements: 'Windows 10 or later (64-bit)',
  },
  {
    id: 'linux',
    name: 'Linux',
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.43.868.074 1.32-.283 1.543-.734.532-1.078.547-2.246.322-3.26 1.063-.976 1.682-2.33 1.682-3.825 0-1.502-.625-2.866-1.702-3.845.021-.085.065-.156.084-.245.06-.345.099-.689.122-1.032.12-.987.146-2.322-.467-3.564-.701-1.423-1.847-2.268-2.93-2.665C14.077.137 13.283 0 12.504 0z" />
      </svg>
    ),
    fileName: `PersonaHub-Desktop-${APP_VERSION}.AppImage`,
    ext: '.AppImage',
    size: '~100 MB',
    requirements: 'Ubuntu 20.04+ / Fedora 36+ (64-bit)',
  },
];

function detectOS(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'windows';
  return 'linux';
}

export function DownloadApp() {
  const userOS = useMemo(() => detectOS(), []);

  return (
    <div className="space-y-10 animate-slide-up">
      {/* Hero Section */}
      <section className="glass-strong rounded-2xl p-10 card-cosmic relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-cosmic-purple/10 rounded-full blur-[80px] pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-cosmic-cyan/10 rounded-full blur-[60px] pointer-events-none"></div>

        <div className="relative z-10 text-center max-w-2xl mx-auto">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cosmic-cyan to-cosmic-purple mb-6 glow-cyan">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 className="text-3xl font-display font-bold text-white mb-3">
            PersonaHub Desktop
          </h2>
          <p className="text-gray-400 font-body text-lg leading-relaxed">
            Run your AI personas locally with full file access, tool security, and offline capabilities.
          </p>
        </div>
      </section>

      {/* Download Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLATFORMS.map((platform) => {
          const isRecommended = platform.id === userOS;
          return (
            <div
              key={platform.id}
              className={`glass-strong rounded-2xl p-6 card-cosmic relative transition-all hover:scale-[1.02] ${
                isRecommended
                  ? 'border-2 border-cosmic-cyan/50 glow-cyan'
                  : 'border border-white/10'
              }`}
            >
              {isRecommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-cosmic-cyan to-cosmic-purple text-white text-xs font-display font-bold rounded-full uppercase tracking-wider">
                  Recommended
                </div>
              )}

              <div className="text-center pt-2">
                {/* OS Icon */}
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4 ${
                  isRecommended
                    ? 'bg-cosmic-cyan/20 text-cosmic-cyan'
                    : 'bg-white/5 text-gray-400'
                }`}>
                  {platform.icon}
                </div>

                <h3 className="text-xl font-display font-bold text-white mb-1">
                  {platform.name}
                </h3>
                <p className="text-sm text-gray-500 font-body mb-4">
                  {platform.ext} &middot; {platform.size}
                </p>

                {/* Download Button */}
                <a
                  href={`${GITHUB_RELEASE_BASE}/${platform.fileName}`}
                  className={`inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl font-display font-semibold transition-all hover:scale-105 ${
                    isRecommended
                      ? 'btn-cosmic'
                      : 'glass hover:glass-strong text-white border border-white/20'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </a>

                <p className="text-xs text-gray-500 font-body mt-3">
                  {platform.requirements}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      {/* macOS Installation Note */}
      {userOS === 'mac' && (
        <section className="glass-strong rounded-2xl p-6 card-cosmic border border-amber-500/30">
          <h3 className="text-base font-display font-bold text-amber-400 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            macOS: Important First-Time Setup
          </h3>
          <p className="text-sm text-gray-400 font-body mb-3">
            Since the app isn't signed with an Apple Developer certificate yet, macOS may show an "app is damaged" warning. To fix this, open <span className="text-white font-semibold">Terminal</span> and run:
          </p>
          <div className="bg-black/40 rounded-lg p-3 font-mono text-sm text-cosmic-cyan select-all cursor-pointer border border-white/5">
            xattr -cr /Applications/PersonaHub\ Desktop.app
          </div>
          <p className="text-xs text-gray-500 font-body mt-2">
            This removes the download quarantine flag. You only need to do this once after installing.
          </p>
          <p className="text-xs text-gray-400 font-body mt-4 pt-4 border-t border-white/5">
            On an Intel Mac (2019 or earlier)?{' '}
            <a
              href={`${GITHUB_RELEASE_BASE}/${MAC_X64_FILE}`}
              className="text-cosmic-cyan hover:text-cosmic-cyan/80 underline transition-colors"
            >
              Download the Intel build instead
            </a>
            .
          </p>
        </section>
      )}

      {/* Windows Installation Note */}
      {userOS === 'windows' && (
        <section className="glass-strong rounded-2xl p-6 card-cosmic border border-amber-500/30">
          <h3 className="text-base font-display font-bold text-amber-400 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Windows: SmartScreen Warning
          </h3>
          <p className="text-sm text-gray-400 font-body">
            Windows may show a <span className="text-white font-semibold">"Windows protected your PC"</span> dialog because the installer isn't yet code-signed. Click{' '}
            <span className="text-white font-semibold">"More info"</span> → <span className="text-white font-semibold">"Run anyway"</span> to install. This is a one-time step.
          </p>
        </section>
      )}

      {/* What is this? */}
      <section className="glass-strong rounded-2xl p-8 card-cosmic">
        <h3 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-cosmic-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          What is PersonaHub Desktop?
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-400 font-body">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-cosmic-cyan/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-cosmic-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">Local AI Agents</p>
              <p>Your personas run locally on your machine with full access to files and tools — no cloud required.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-cosmic-purple/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-cosmic-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">Tool Security</p>
              <p>Tiered permission system controls what each persona can do — file access, shell commands, and more.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-cosmic-magenta/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-cosmic-magenta" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <p className="text-white font-semibold mb-1">Sync with Cloud</p>
              <p>Personas you create on the web sync automatically to the desktop app — work from anywhere.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Version info */}
      <p className="text-center text-xs text-gray-600 font-body">
        Version {APP_VERSION} &middot; Open source on{' '}
        <a
          href="https://github.com/LashaKh/Flowise-Agent-Creator"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cosmic-cyan/60 hover:text-cosmic-cyan transition-colors"
        >
          GitHub
        </a>
      </p>
    </div>
  );
}
