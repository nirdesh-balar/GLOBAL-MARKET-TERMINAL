# Codex development log

## 2026-11-22 — Mac-first baseline and workflow

- Audited the official `main` at `5a3c0713e08e9fbb739272f2363acfd45465b377`. Added the project map, Mac release record, Windows queue and contributor instructions through a documentation-only change.
- `npm run build` passed both TypeScript checks, renderer bundling and arm64 native compilation. Vite reported a large chunk warning. `npm run test` and direct pytest each returned 2,419 passed, 1 skipped, 0 failed and 1 Starlette/httpx deprecation warning. The skip was a test that depends on an optional copied user database.
- `npm run test:platform` passed 19 macOS and 23 Windows checks. `npm run test:package:config` passed 45 Windows configuration checks. `npm run test:release` passed 64 unit checks. The 6 source version consistency checks and 18 macOS numerical scripts passed. The native backend lifecycle script passed private-command and parent-EOF shutdown. The watchlist F3.1 sorting and selection script passed.
- Native macOS development smoke passed through the Vite renderer, Electron and fixture backend with restart persistence. The full `test:macos -- --ui` command stopped at a pre-existing `release-ui.mjs` expectation for `1.1.0-rc.1`. The actual installed-version label correctly showed `1.1.0-rc.6`. This script also runs in the PR source workflow.
- Built and inspected a new ad-hoc ARM64 candidate from the audited SHA. Native permissions resolved a sandbox-only DMG creation failure. Recorded distinct source/packaged and bounded live market evidence in [Mac release status](MAC_RELEASE_STATUS.md). Tracked exact-SHA Windows native checks in [Windows pending](WINDOWS_PENDING.md).
