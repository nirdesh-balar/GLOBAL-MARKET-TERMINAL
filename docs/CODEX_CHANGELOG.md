# Codex development log

## 2026-11-23 · Phase 1 Advanced Chart Grid

- Add a separate workspace with ordered canonical watchlist and scanner inputs, per-card and global timeframes, selectable columns and card sizes, and 20-candle SMA/EMA overlays. Preserve the normal chart pane state when switching.
- Mount at most eight Grid charts per page and one when maximized. Limit Grid history to two active leases, remove invisible charts and release old history owners. Preserve shared requests needed by another consumer and use the existing backend cache and provider limits.
- Store Grid settings in a versioned profile field with legacy defaults. Rehydrate display metadata from exact registry matches. Existing source/version/profile boundaries remain in effect.
- Add backend repair/validation tests and the Grid numerical and native UI suites. The new benchmark records cold and cached timings, upstream counts and memory independently of the existing Charts gate. Windows native acceptance is tracked by WIN-CHARTGRID.

## 2026-11-22 — Electron security remediation

- Replace Electron 44.7.2 with the exact stable 44.11.5 pin to address [CVE-2026-115570](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9). Retain Node 22.19.0 for development and bump the desktop candidate to 1.1.0-rc.7.
- Keep the API contract, bundle identity, and updater policy. Validate the frozen backend, packaged Electron and native notification bridge on Apple Silicon. Keep source checks, isolated live candidate checks, and installed-profile evidence associated with their actual revisions.
- The npm lockfile audit reported seven moderate and one high development-tooling findings and zero findings in the production dependency graph. The Electron advisory was absent after the exact pin update.
- Record the Windows-native follow-up under WIN-ELECTRON44. Local installation and public installer publication have separate gates.

## 2026-11-22 — Integrate the CI foundation

- PR #2 head `c1bec30f77921c304f3a8899fbffad46554d8aa8` entered official `main` at `901540d084e995d12974dfe8ed1ed1244bca7fb2`. The source workflow now runs on main pushes as well as pull requests. The candidate and source runners use the available Python 3.11.9 ARM64 image build, provision locked Electron, and test using prepared official NSE fixtures.
- The [exact PR #2 hosted run](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45017424968) passed 2,419 backend tests (one optional skip), the build, platform and version checks, 18 numerical scripts, and 31 UI scripts. The Mac comparison worktree at that PR head also passed the build, release-version UI and Ichimoku autosave/restart checks. The release test reads the manifest version, and the Ichimoku test asserts stored settings before and after restart.
- The permanent checkout is `~/Projects/GLOBAL-MARKET-TERMINAL`. The final documentation merge revision requires a fresh full native run and its own candidate record. Keep source, fixture, package, installation, and public release evidence labeled with their actual revisions. Windows native validation and trusted Mac distribution remain pending.

## 2026-11-22 — Mac-first baseline and workflow

- Audited the official `main` at `5a3c0713e08e9fbb739272f2363acfd45465b377`. Added the project map, Mac release record, Windows queue and contributor instructions through a documentation-only change.
- `npm run build` passed both TypeScript checks, renderer bundling and arm64 native compilation. Vite reported a large chunk warning. `npm run test` and direct pytest each returned 2,419 passed, 1 skipped, 0 failed and 1 Starlette/httpx deprecation warning. The skip was a test that depends on an optional copied user database.
- `npm run test:platform` passed 19 macOS and 23 Windows checks. `npm run test:package:config` passed 45 Windows configuration checks. `npm run test:release` passed 64 unit checks. The 6 source version consistency checks and 18 macOS numerical scripts passed. The native backend lifecycle script passed private-command and parent-EOF shutdown. The watchlist F3.1 sorting and selection script passed.
- Native macOS development smoke passed through the Vite renderer, Electron and fixture backend with restart persistence. The full `test:macos -- --ui` command stopped at a pre-existing `release-ui.mjs` expectation for `1.1.0-rc.1`. The actual installed-version label correctly showed `1.1.0-rc.6`. This script also runs in the PR source workflow.
- After the fail-fast run, the other 30 listed scripts ran individually on macOS. The first pass returned 20 passes and 10 unsuccessful runs. Serial retries with display idle sleep inhibited recovered the paused crypto fixtures and the volume, layout and drawing-gesture scenarios. The longer drawing test completed all 46 tools in 259 seconds. Across all 31 scripts, 29 passed and 2 failed. The remaining trend test reproduced a missing persisted Ichimoku record when it read the workspace immediately after the chart calculation. The supplemental F3.2 theme check passed when rerun with a fresh temporary root after a fixed-profile lock collision.
- The first GitHub PR workflow stopped at `actions/setup-python` because the pinned Python 3.11.13 arm64 build was unavailable for its macOS 15.8.2 runner. The build and tests were skipped there. Local Python 3.11.17 matched the dependency constraints. GitHub integration remains pending CI. [GitHub Actions run](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/44999219104)
- Built and inspected a new ad-hoc ARM64 candidate from the audited SHA. Native permissions resolved a sandbox-only DMG creation failure. Recorded distinct source/packaged and bounded live market evidence in [Mac release status](MAC_RELEASE_STATUS.md). Tracked exact-SHA Windows native checks in [Windows pending](WINDOWS_PENDING.md).
