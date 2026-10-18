# Build

Official repository: https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL. Select an exact reviewed commit. Build dependencies are separate from end-user installation requirements.

Use Node 22.19.0 and native Python 3.11. Windows CI pins Python 3.11.13 x64; the current local Mac toolchain is Python 3.11.17 arm64. JavaScript and Python dependency lockfiles are committed. Run `npm ci`; run `npm run setup` on Mac or `npm run setup:windows` on Windows. `npm run build` checks renderer/main/preload TypeScript, builds Vite/esbuild and the host native helper.

On Apple Silicon run `npm run package:public:mac`. It freezes a native Python backend and builds a new DMG, ZIP, blockmaps and latest-mac.yml. Default output is `../../release-v1.0.0-global-market-terminal/mac-candidate` from the private maintained checkout; in a public checkout set GMT_MAC_OUTPUT to a NEW project-owned directory (the CI workflow does this explicitly). Existing output is rejected. Default signing is ad-hoc and updates are blocked. Set GMT_SIGNED_RELEASE=1 only with independently provisioned Developer ID/notarization credentials; do not disable signature validation to make it pass.

On Windows x64 run `npm run package:windows`. Output is `release-v1.0.0-global-market-terminal-windows/build` under the source checkout. It freezes Windows Python, compiles the Windows addon, builds NSIS and validates AMD64 application/backend payloads. No Mac binary is copied into Windows. For a signed candidate, configure the real certificate and publisher in the protected build environment before setting GMT_SIGNED_RELEASE=1. Windows 11 native acceptance remains required after hosted Server CI.

The public source and installer omit NSE CSV snapshots. The application fetches official directory metadata directly at startup, or accepts permitted manual official files. Local deterministic tests require test-only official directory files: run `node scripts/download-test-directory.mjs`. This bounded download respects failures; it is not a bypass and downloaded files are ignored by Git and omitted from public payloads. Provider failures must be reported rather than inventing instruments.

The proposed MIT license, exact source manifest, native acceptance and release assets require owner approval before publication. No build command publishes automatically.
