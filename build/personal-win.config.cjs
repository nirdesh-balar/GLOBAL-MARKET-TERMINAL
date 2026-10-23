const { execFileSync } = require('node:child_process');

function getSourceRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return 'windows-personal';
  }
}

/**
 * Windows Personal Packaging Configuration
 * Local x64 NSIS installer for personal market analysis.
 * Automatic GitHub updates and remote feeds are disabled.
 */
module.exports = {
  extends: null,
  appId: 'local.globalmarket.terminal.personal',
  productName: 'GLOBAL MARKET TERMINAL',
  directories: {
    output: process.env.GMT_WIN_OUTPUT || 'release-win-candidate',
  },
  files: [
    'desktop/dist/**/*',
    'desktop/dist-electron/main.cjs',
    'desktop/dist-electron/preload.cjs',
    '!desktop/dist-electron/*.node', // Exclude macOS native addons
    'package.json',
    'NOTICE',
    'LICENSE',
    'THIRD_PARTY_NOTICES/**/*',
  ],
  extraResources: [
    {
      from: 'backend/dist-windows/imt-backend',
      to: 'backend',
      filter: ['**/*'],
    },
  ],
  extraMetadata: {
    sourceRevision: getSourceRevision(),
    releaseChannel: 'personal-windows',
    updateReadiness: 'disabled-personal',
    isPersonalBuild: true,
  },
  asar: true,
  asarUnpack: [],
  npmRebuild: false,
  publish: null,
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'desktop/assets/icon.ico',
    artifactName: 'GLOBAL-MARKET-TERMINAL-Setup-${version}-win-x64.${ext}',
    legalTrademarks: 'GLOBAL MARKET TERMINAL',
    requestedExecutionLevel: 'asInvoker',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'GLOBAL MARKET TERMINAL',
    uninstallDisplayName: 'GLOBAL MARKET TERMINAL',
    deleteAppDataOnUninstall: false,
    artifactName: 'GLOBAL-MARKET-TERMINAL-Setup-${version}-win-x64.exe',
  },
};
