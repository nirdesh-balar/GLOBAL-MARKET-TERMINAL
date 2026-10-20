# macOS testing and native acceptance

Run `npm ls --all`, `npm run build`, `npm test`, `npm run test:platform`, `npm run test:release` and `node scripts/verify-macos.mjs`. The verification runner supports `--math` and `--ui`; GUI suites run serially on one desktop. Existing indicator, drawing, provider, screener, watchlist/CSV, alert, refresh, fullscreen and replay suites are retained. Controlled fixtures do not establish live-provider availability or native notification receipt.

Use unique temporary profiles and the guarded launcher. Never open an archived preview or normal userData. For packaged tests supply the exact NEW candidate executable in GMT_MAC_TEST_EXE. The guard checks bundle identity, temporary-directory containment, symlink escapes and actual userData before interaction. Tests must preserve all established protected profile and release hashes.

Verify the DMG read-only, inspect the app/Applications link, copy into a private installation slot and verify arm64 app/backend plus strict signing. Launch with a temporary profile; load real Yahoo and officially discovered Hyperliquid spot/perpetual charts; exercise indicators, drawings, layouts, fullscreen and replay. Restart and compare settings. Do not overwrite Applications or remove quarantine. Local ad-hoc startup is not downloaded Developer ID/Gatekeeper acceptance.

Native notification integration has deterministic lifecycle/permission/dispatch tests. Actual banner receipt and click navigation require a separately observed macOS test; do not infer receipt from Electron show events.

For native updates use two separately approved Developer ID signed and notarized versions. Save settings in A, validate B through the official feed, explicitly restart and compare data. Mock updater events do not satisfy this gate. Native version-to-version updates remain UNVERIFIED.
