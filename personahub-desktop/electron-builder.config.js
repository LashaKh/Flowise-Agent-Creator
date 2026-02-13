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
  // macOS
  mac: {
    target: ['dmg', 'zip'],
    artifactName: 'PersonaHub-Desktop-${version}.${ext}',
    category: 'public.app-category.productivity',
    icon: 'build/icon.icns',
  },
  dmg: {
    artifactName: 'PersonaHub-Desktop-${version}.${ext}',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  // Windows
  win: {
    target: ['nsis'],
    icon: 'build/icon.ico',
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
