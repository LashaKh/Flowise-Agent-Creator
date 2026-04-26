/**
 * electron-builder configuration
 * Builds installers for macOS (DMG), Windows (NSIS), and Linux (AppImage)
 */
export default {
  appId: 'com.personahub.desktop',
  productName: 'PersonaHub Desktop',
  directories: {
    output: 'release',
    buildResources: 'build',
  },
  files: [
    'dist/**/*',
    'dist-electron/**/*',
    'public/**/*',
  ],
  asarUnpack: [
    '**/node_modules/openclaw/**',
    '**/node_modules/sharp/**',
    '**/node_modules/@img/**',
    // better-sqlite3 ships a native .node addon that cannot load from inside
    // a compressed .asar. Without this entry the packaged app crashes at DB
    // init with "NODE_MODULE_VERSION mismatch" or "Cannot find module".
    '**/node_modules/better-sqlite3/**',
    '**/node_modules/bindings/**',
  ],
  // macOS
  mac: {
    // Build for both Apple Silicon (arm64) and Intel (x64). Without explicit
    // arch, electron-builder defaults to host arch — the macos-latest CI
    // runner is arm64, so Intel-Mac users get no installable build.
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    artifactName: 'PersonaHub-Desktop-${version}-${arch}.${ext}',
    category: 'public.app-category.productivity',
    icon: 'build/icon.icns',
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    extendInfo: {
      NSMicrophoneUsageDescription: 'PersonaHub needs microphone access for voice input — speak to your AI personas hands-free.',
    },
    // Code signing — supply via env in CI. With identity=null we still
    // build a ad-hoc-signed .app (Mac-Developer gated), which is fine for
    // local dev but Gatekeeper will block public downloads. Set these in
    // CI / release workflow:
    //   CSC_LINK, CSC_KEY_PASSWORD — .p12 cert for signing
    //   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID — for notarization
    identity: process.env.CSC_LINK ? undefined : null,
    notarize: process.env.APPLE_ID
      ? {
          teamId: process.env.APPLE_TEAM_ID,
        }
      : false,
  },
  dmg: {
    // Include arch so arm64 and x64 DMGs don't overwrite each other.
    artifactName: 'PersonaHub-Desktop-${version}-${arch}.${ext}',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  // Windows
  // Code signing: electron-builder picks up WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD
  // env vars automatically when set in CI. Until a cert is purchased, builds
  // ship unsigned and SmartScreen will warn on first install — see SIGNING.md.
  win: {
    target: ['nsis'],
    icon: 'build/icon.ico',
    signtoolOptions: {
      signingHashAlgorithms: ['sha256'],
    },
  },
  nsis: {
    artifactName: 'PersonaHub-Desktop-Setup-${version}.${ext}',
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    installerIcon: 'build/icon.ico',
  },
  // Linux
  linux: {
    target: ['AppImage'],
    artifactName: 'PersonaHub-Desktop-${version}.${ext}',
    category: 'Utility',
    icon: 'build/icon.png',
  },
  // Auto-update
  publish: {
    provider: 'github',
    owner: 'LashaKh',
    repo: 'Flowise-Agent-Creator',
  },
  // Protocol handler registration
  protocols: [
    {
      name: 'PersonaHub',
      schemes: ['personahub'],
    },
  ],
};
