# Codex development log

## 2026-11-27 · Volume controls in the chart legend

- Place the main-chart Volume name, candle value, and controls in the upper-left study legend. Keep the bars on their existing scale at the bottom of the price pane. A dedicated Volume pane retains its own header.
- Preserve overlay legend order with a backward-compatible optional setting. Collapse hides the legend rows, hide keeps the Volume instance available to show again, and removal persists across restarts.
- Local Apple Silicon verification passed 2,507 Python tests with one optional database-copy skip and 22 numerical scripts. The complete native run passed 44 of 47 UI scripts. Same-source diagnostic checks passed the original Watchlist resize, Stage 1 drawing and streaming fullscreen assertions. The documented intermittent fullscreen and focus issue remains open.
- Normal eight-chart warm restore took 404 ms. Six Grid warm restores took 47.8–156.9 ms. Warm restores issued zero additional provider requests, and Grid peaked at eight charts and two concurrent new history requests. Native ICICIBANK 15m captures at 1440 × 834 matched across all 61,685 compared histogram pixels.

## 2026-11-27 · Volume placement and single legend

- Add Volume from the indicator library only. Use a dedicated overlay scale at the bottom of the price pane by default, or move the instance to a resizable study pane. Native pane swaps preserve unrelated series and saved heights.
- Remove the chart toolbar Volume toggle and the duplicate upper Volume readout. Keep one Volume label and its controls with the rendered series. Keep Watchlist refresh feedback.
- Migrate saved Volume settings to version 2 with backward-compatible dedicated placement. New charts begin without Volume. Hidden and removed instances retain their distinct behavior after restart.
- On the same macOS arm64 application source, 2,507 Python tests passed with one optional database-copy skip, and 22 numerical scripts passed. The full native run and focused follow-ups verified all 46 UI scripts and the supplemental workspace check. Normal eight-chart warm restore took 350 ms. Six Grid warm restorations took 67.4–191.2 ms with zero provider requests, up to eight charts and two concurrent new histories.
- The first fullscreen assertion saw focus loss and no native enter event. The lifecycle follow-up passed fullscreen and Escape with the original 15-second assertion. The intermittent Electron/macOS focus issue remains open.

## 2026-11-27 · Volume indicator and chart toolbar

- Move workspace saving to the chart overflow and TradingView attribution to Application settings → About and licenses. The existing NOTICE, automatic local saving, and Watchlist quote timestamp remain in use.
- Manage the existing native Volume histogram through Technicals and Active indicators. Store visibility, colors and pane position per chart. Preserve the legacy volume flag and pane dimensions, and retain an explicit removal across restarts.
- Show the active Volume value without the timestamp in the ordinary legend. The Data Window and crosshair retain the timestamp, and Volume changes reuse loaded candles.
- Local macOS arm64 verification passed 2,502 Python tests with one optional database-copy skip, 22 numerical scripts, 45 UI scripts across the complete run and focused checks, and the supplemental workspace test. Normal eight-chart warm restore took 400 ms. Six Chart Grid warm restores took 47.3–158.0 ms with zero provider requests, at most eight charts and two concurrent new histories.
- The initial fullscreen check recorded a show/hide cycle and focus loss during the existing 15-second assertion. A focused follow-up passed fullscreen and Escape with the original assertions. The documented intermittent Electron/macOS focus issue remains open.

## 2026-11-27 · Chart readability and footer cleanup

- Remove the application status bar and the Watchlist symbol summary and directory count. Keep the Watchlist quote timestamp and interval on its compact refresh line. Save feedback remains on the toolbar control and save errors remain visible.
- Place the TradingView link in the chart toolbar and the application header for other workspaces. Preserve the repository attribution notice.
- Use 13 px OHLC, symbol, timeframe, and canvas axis labels on the main chart. Indicator values and chart controls use 12 px at normal widths. Keep saved study heights consistent with the chart widget’s even-pixel geometry.

## 2026-11-27 · Chart menu, index access and data labels

- Share a themed, grouped chart style menu between the main toolbar and chart panes. All 13 existing styles retain their stored identities and render from already loaded candles.
- Open index constituents from the selected chart's Data controls. Symbol Search continues to find Indian and global indices through its normal categories.
- Keep source names, retrieval timestamps and freshness disclosures in Data details and diagnostics. Keep the footer focused on save status and TradingView attribution. [Reference workflow](REFERENCE_ANALYSIS_WORKSPACE.md)

## 2026-11-27 · Reference UI corrections and index membership

- Compact Symbol Search and Index Search into single-row category strips. Give Indicators full-width single-line navigation while retaining the existing categories, presets and typed study editor.
- Remove Chart Compare and the duplicate main-toolbar timeframe selector. Preserve the independent percentage-price scale, chart settings and layout state when opening older profiles.
- Open NIFTY 50 by its canonical Yahoo Finance index identity. Add a searchable, locally imported constituent table with separate membership and cached quote provenance. [Reference workflow](REFERENCE_ANALYSIS_WORKSPACE.md)

## 2026-11-26 · Reference analysis workspace

- Reuse canonical symbol search for index lookup and bounded percent comparisons. Add grouped intervals, 13 genuine chart presentations, a crosshair Data Window and verified daily Yahoo dividend badges.
- Extend the indicator manager with Favorites, Recently Used and typed local study revisions. Reuse the existing local alerts engine for completed-candle crossings. [Video audit and review scope](REFERENCE_ANALYSIS_WORKSPACE.md)

## 2026-11-26 · Watchlist quote refresh ownership

- Fence each Watchlist refresh by client, selection generation and request sequence. The backend accepts a snapshot only after the corresponding list and timeframe have been registered. Polls also carry the expected job ID. Closing or replacing a selection retires its generation and cancels only its work.
- Keep quote values by canonical instrument and timeframe in a bounded memory cache shared across selections. Show the last valid value with its existing provenance and stale status. Retain provider backoff, shared request budgets and startup opt-out.
- On Phase 3 post-merge run `45817781307`, Stage 6.6 found zero ready rows after Stocks → US → Crypto → Stocks. A controlled Mac reproduction on `f1d2f106` showed a late Crypto POST displacing the new Stocks job even with all eight prices still cached. The hosted log lacks request ordering. Stage 6.6 now requires the intended completed job and checks all eight canonical rows and rendered prices. The controlled Electron regression also delivers old starts, cancellation and status after a newer selection.

## 2026-11-24 · Phase 3 search and profile recovery

- Give each symbol search one chart or Watchlist destination. Closing it clears that destination, and a pending Watchlist write cannot close a later search.
- Repair legacy instrument metadata from the workspace read inside the Watchlist transaction. Preserve revision checks, explicitly deleted lists, and atomic recovery of unsupported Chart Grid settings.

## 2026-11-24 · Watchlist readability and management
- Increase Watchlist type and use sticky, horizontally scrollable column headings at narrow widths. List management lives in the name picker.
- Rename, copy, and confirm deletion for every ordinary list. Copies retain the source memberships and per-list grouping and visibility preferences. Flagged views can be copied to independent lists and keep their flag assignments.
- Initialize legacy default lists once. Preserve explicit deletions and the empty state across restart, without touching charts, drawings, alerts or the directory.

## 2026-11-24 · Compact Watchlist
- Use a keyboard-operated list picker and move list controls into the header overflow. The Watchlist plus opens the existing provider search in add mode and uses canonical duplicate protection.
- Keep compact price rows, optional volume and a collapsed instrument summary. Changes in displayed prices animate with reduced-motion support. The summary reads already loaded data.
- Preserve flat ordering by default. Group-by-market and its collapsed sections save per list. Orange is independent of Yellow. Existing list IDs, memberships, flag aliases and provider limits remain compatible.

## 2026-11-24 · Indicator legend and chart clock
- The per-chart indicator list shows provider-independent calculated values at the crosshair or at the latest displayed candle. Its collapse state, individual visibility, and native study pane collapse are independent. Hidden studies remain available to restore in the list.
- The timezone button displays the machine wall clock and current offset. Visible charts share one timer. Candle countdowns use validated Hyperliquid close timestamps or fresh Yahoo daily/native intraday session bounds. Closed, stale, unsupported, and replay data have no countdown. No new provider request is made to run either clock.

## 2026-11-24 · Study pane resizing
- Track the native pane elements from Lightweight Charts 5.2.1, so study headers stay with their panes during a held separator drag. Resize events update header coordinates without rerendering the chart.
- Keep native separator resizing and persist heights only for expanded studies whose divider actually changed. Remove the separate Height controls. Preserve per-chart heights through layout and viewport changes.

## 2026-11-24 · Chart toolbar cleanup
- The main toolbar keeps the visible timeframe buttons and an icon-only Indicators button. Analytical alerts remain available through the Alerts workspace, chart cursor and multi-chart pane controls.
- The single-chart toolbar keeps Auto Refresh, Refresh, Volume and Maximize/Restore. Multi-chart panes keep independent instrument, timeframe, chart type, indicator and alert controls.
- Charts and Advanced Chart Grid use Lightweight Charts 5.2.1's `layout.attributionLogo: false`. The clickable status-bar TradingView attribution and the upstream NOTICE and license remain available.

## 2026-11-24 · Phase 3 live public Order Flow
- Add an analysis dock for the active verified Hyperliquid instrument. The same validated book supplies best bid and ask, absolute and midpoint percentage spread, cumulative depth and top-five-per-side imbalance. The tape shows observed public prints with the provider side code.
- Share the existing public socket and signed-off provider identity model. Regular chart, watchlist and alert demand takes priority. Closing or leaving the dock releases its interests. The tape is bounded to 1,000 prints or 30 minutes, and gaps survive reconnection within the session. Order Flow stores no additional profile data and makes no historical candle requests.
- The native fixture is included in the complete macOS UI suite. For additional real-provider checks, use `node scripts/order-flow-ui.mjs --live` after the source build on Apple Silicon. Each run creates a temporary profile.


## 2026-11-23 · Private rc.8 Mac installation

- Installed the approved `1.1.0-rc.8` ARM64 candidate at `/Applications/GLOBAL MARKET TERMINAL.app` from `a63a96cbff1b72c7cbc2e710cf3cab93d68689e2`. Verified the signed Mac build 1.1.0.3, Electron 44.11.5, API 1.0.0, embedded source and blocked updater state.
- Retained the rc.7 original and rollback release set. Verified three backups after shutdown, normal installed restart, production profile continuity and clean backend exit. Installed disposable-profile testing covered live providers, Chart Grid and supported saved workspaces. [macOS release status](MAC_RELEASE_STATUS.md)
- Charts reproduced the known macOS fullscreen cancellation. Grid entered and exited native fullscreen and its focus check timed out after exit. A leftover empty directory from installed disposable testing initially blocked the next normal launch. The normal restart passed after preserving the test-only directory with the private evidence.
- Generated a read-only cleanup proposal for regenerable packaging output. Windows native `WIN-CHARTGRID` and `WIN-ELECTRON44` remain pending.

## 2026-11-23 · Phase 1 integration and rc.8 preparation

- Merged [PR #5](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/pull/5) as `3f044d65fcc3dc78177aeddcadc65e436fa4c673` with both parents preserved. The merged tree matched the [first successful main-target attempt](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45131060334). See the [post-merge run](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45135294940) for the integrated SHA.
- Prepare 1.1.0-rc.8 in a separate source revision. Set the native Mac build to 1.1.0.3, retain native short version 1.1.0, Electron 44.11.5 and API 1.0.0, and include rc.8 in the isolated packaged acceptance guard.
- Keep the local fullscreen result open after reproducing the transition cancellation in a standalone Electron window. The fullscreen assertion, 15-second timeout, strict under-2,000 ms Charts gate and zero additional provider request assertion still apply. [Candidate gates](MAC_RELEASE_STATUS.md)

## 2026-11-23 · Stage 4 drawing persistence synchronization

- `drawing-stage4-ui.mjs` now waits for the expected count of distinct replacement drawing IDs from the persisted workspace and verifies that every old ID is gone. The bounded wait completes before the snapshot used for the invalid-import equality assertion. Template replacement intentionally creates new IDs, while workspace saves are debounced. The previous count-only wait could compare different saves of the same-size drawing set.
- The same drawing assertion failed on the Phase 0 post-merge run and the corrected Phase 1 main-target run. Neither run showed a drawing renderer error. The test correction leaves application persistence, restart, drawing security and history assertions intact. [Phase 0 job](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45120305418/job/137512300672) · [Phase 1 job](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45120427073/job/137512686413)

- With a controlled workspace write, the old test captured the old IDs and failed the equality assertion. The corrected script read the old set while the write was held and passed once the replacement IDs persisted. Three additional isolated runs passed all nine Stage 4 tools and restart checks. A rejected replacement save timed out at the new wait, and a deliberate persisted drawing change after rejected import still failed the original equality assertion.

### Hosted normal eight-chart warm restore

| Run | Time | Existing latency gate |
| --- | ---: | --- |
| rc.7 main, [attempt 1](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45036636194/attempts/1) | 2,173 ms | Failed |
| rc.7 main, [attempt 2](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45036636194/attempts/2) | 1,930 ms | Passed |
| Phase 0 documentation [PR #4](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45107048542) | 1,649 ms | Passed |
| Phase 1 exact head, [attempt 1](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45107055210/attempts/1) | 2,641 ms | Failed |
| Phase 1 same head, [attempt 2](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45107055210/attempts/2) | 1,714 ms | Passed |
| Phase 0 documentation [post-merge main](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45120305418) | 3,641 ms | Failed |
| Phase 1 recovery [main-target PR #5](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45120427073) | 1,853 ms | Passed |

All seven measurements cleared the zero-additional-provider-requests assertion, which runs before the strict latency assertion. Phase 0 post-merge did not contain Chart Grid. Its diagnostics showed eight rendered panes with 8,000 bars each and no renderer errors. Phase 1's 2,641 ms failure likewise rendered all eight panes with no renderer errors. The hosted logs do not isolate the delay among cached history handling, IPC and render scheduling.

In prior matched Apple Silicon tests, Phase 0 measured 760, 782 and 800 ms, and Phase 1 measured 757, 801 and 769 ms. Both native traces returned seven cached 8,000-bar responses after the restore click, with the final responses decoded at approximately 552 and 549 ms, respectively. The hosted outliers were not reproduced within those controlled local samples. Preserve the strict below-2,000 ms and zero-additional-provider assertions. Native Windows verification remains pending under `WIN-CHARTGRID` and `WIN-ELECTRON44`.

## 2026-11-23 · Phase 1 Advanced Chart Grid

- Recover malformed or unsupported stored Grid settings when loading the workspace. A subsequent valid watchlist operation or workspace save preserves the original Grid payload for recovery and commits the supported settings in the same SQLite transaction. Workspace loading does not write to the profile.
- Hosted source CI at `12a0f0b8a359fd482cae716c37f0e2ab5e5f7efc` initially failed the ordinary eight-chart warm restore at 2,641 ms. Attempt 2 passed at 1,714 ms on the same revision. Both recorded zero additional provider requests. The strict limit remains below 2,000 ms. The cause of the first timing remains unresolved. [First attempt](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45107055210/attempts/1) · [Successful retry](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45107055210/attempts/2)

- Add a separate workspace with ordered canonical watchlist and scanner inputs, per-card and global timeframes, selectable columns and card sizes, and 20-candle SMA/EMA overlays. Preserve the normal chart pane state when switching.
- Mount at most eight Grid charts per page and one when maximized. Limit Grid history to two active leases, remove invisible charts and release old history owners. Preserve shared requests needed by another consumer and use the existing backend cache and provider limits.
- Store Grid settings in a versioned profile field with legacy defaults. Rehydrate display metadata from exact registry matches. Existing source/version/profile boundaries remain in effect.
- Place watchlist Grid actions in the existing search toolbar. The popover preserves earlier sidebar row density and supports keyboard activation and Escape focus restoration.
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

### Symbol Search and Pine-compatible editor · 2026-11-27

- Simplified Symbol Search to compact rows with favorites and searchable market tabs. Index Details remains available from Search indices. Colored flags continue through the chart header and Watchlists.
- Rebuilt Indicator Library navigation with Technicals, Favorites, Recently Used and My Scripts. Existing study settings and presets are available under Active indicators.
- Added the bounded Pine-compatible source editor, chart plots and conditional fills, with local source revisions and legacy typed study recovery. See [supported syntax and native verification](PINE_COMPATIBLE_EDITOR.md).
