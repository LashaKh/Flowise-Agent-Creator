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
    // Unpack ALL node_modules. Openclaw is an ESM module spawned via
    // `process.execPath` + ELECTRON_RUN_AS_NODE; Node's ESM resolver
    // cannot see into the asar archive, so any transitive dep that's
    // hoisted to the top-level node_modules (e.g. tslog) fails with
    // ERR_MODULE_NOT_FOUND. Also covers native addons like better-sqlite3
    // and sharp that need an on-disk .node file. The cost is a slightly
    // larger install footprint; the win is reliable runtime resolution.
    '**/node_modules/**',
  ],
  // macOS
  mac: {
    // No arch in target — let CLI flags (--x64 / --arm64) drive the arch.
    // When BOTH archs are passed via CLI, both are built. With no arch
    // arg, host-arch only. Critically, a per-arch electron-builder call
    // with `--prepackaged X --x64` only produces x64 output ONLY when
    // the config doesn't pre-declare both archs. The previous form
    // `arch: ['arm64','x64']` caused electron-builder to build BOTH
    // archs from a single prepackaged input and overwrite the output —
    // ending up with two DMGs that both contain whichever arch ran last.
    target: ['dmg', 'zip'],
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
