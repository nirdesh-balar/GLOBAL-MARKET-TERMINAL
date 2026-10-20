# macOS Apple Silicon build

GLOBAL MARKET TERMINAL is a macOS desktop application. Supported builds are arm64 only. Intel builds are not verified.

Use Node 22.19.0 arm64, native Python 3.11 (local verified runtime: 3.11.17 arm64) and Xcode Command Line Tools with N-API headers. Run `npm ci`, `npm run setup`, then `npm run build`. The committed JavaScript and Python locks remain in use. The build checks renderer and Electron TypeScript, builds Vite/esbuild and compiles the native macOS notification bridge.

`npm run package:mac`, `npm run package:stable` and `npm run package:public:mac` all build a native frozen Python backend and arm64 DMG/ZIP, blockmaps and latest-mac.yml. Set GMT_MAC_OUTPUT to a NEW absolute project-owned candidate directory. Existing output is rejected; no build publishes automatically. Packaging requires at least 2 GiB free; allow additional temporary headroom. Never remove an old release to make a build proceed without itemized approval.

Signing defaults to ad-hoc; automatic updates remain blocked. Set GMT_SIGNED_RELEASE=1 only in a separately approved build environment with Developer ID and notarization credentials. Ad-hoc signatures are not trusted Developer ID or Gatekeeper acceptance. Never upload signing credentials or bypass system security.

Public source and installers omit NSE CSV snapshots and user profiles. Tests use local official directory files obtained by `node scripts/download-test-directory.mjs`; downloads respect provider failures. Market data history stays in bounded RAM. See LICENSE-AUDIT.md for unchanged third-party and data rights obligations.
