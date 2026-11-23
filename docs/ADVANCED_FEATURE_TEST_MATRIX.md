# Advanced Feature Test Matrix

Phase 0 acceptance plan with Phase 1 source tests · 23 November 2026

Phase 1 has deterministic backend, numerical and native fixture scripts in the maintained runner. Subsequent feature rows remain proposals. The verified pre-existing baseline is official `f53b57f84b7ff4cac784f54856a47292cc4a8a9c` and macOS 1.1.0-rc.7 ARM64 with Electron 44.11.5. Successful CI attempt 2 reported 2,419 Python passes, one optional skip, 31/31 macOS UI scripts and 18/18 numerical scripts. It measured 1,930 ms for warm Charts restoration and zero additional provider requests, following 2,173 ms on attempt 1. Windows native `WIN-ELECTRON44` remains pending. [CI run](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45036636194) · [Windows pending](WINDOWS_PENDING.md)

## Evidence and fixtures

- **Shared** tests exercise typed frontend/backend contracts and deterministic behavior. **Mac** means execution on native Apple Silicon with an isolated profile. **Windows** means native Windows x64, with evidence separate from shared source and packaging assertions. A required native result stays pending until executed.
- Use small pinned synthetic histories and the project-approved market directory fixtures. Cover Yahoo equities, ETFs, indices and missing data plus Hyperliquid spot and perpetual identities. Include timezone transitions, half-days and 24/7 bars where relevant. Record fixture identities and clock basis.
- Run performance and resilience fixtures in disposable profiles outside the daily user profile. Record the source and build SHA, application/Electron versions, machine, OS, sample counts, fixture/provider mode, actual outcomes, clock, instrumentation and CI run link. Preserve evidence outside source control under the project's existing rules. Separate authorized live provider smoke checks from deterministic tests.
- Compare resource readings after equivalent quiescent states. Sample renderer and backend RSS/CPU independently and count mounted charts, in-flight owners, subscriptions, listeners and handles. Set native workload and trend acceptance before optimization starts. Keep failed samples in the record.

## Existing regression gates

| ID | Acceptance | Existing coverage and surface |
| --- | --- | --- |
| BASE-01 | Install pinned build dependencies and pass required build, shared, platform, package, release and version consistency checks under the project test plan. Record counts and skips. | Shared, Mac. [Testing](TESTING.md) · [Version consistency](../scripts/version-consistency-test.mjs) |
| BASE-02 | Existing eight-chart Charts warm restore stays strictly below 2,000 ms with zero additional provider requests. Keep the assertion and test setup intact. | Mac. [Terminal UI](../scripts/terminal-ui.mjs) |
| BASE-03 | Preserve layouts, pane synchronization, timeframe, replay, known indicator/drawing behavior, menus, viewport and keyboard navigation. | Shared, Mac and corresponding native Windows. [Layout UI](../scripts/layout-stage67f-ui.mjs) · [Replay lifecycle](../scripts/replay-series-lifecycle-ui.mjs) |
| BASE-04 | Preserve watchlist CRUD/selection, alerts, screener presets/jobs/results, native exports, prior profile schemas and local data continuity. | Shared and native packaged tests. [Watchlist tests](../backend/tests/test_watchlists.py) · [Screener UI](../scripts/screener-stage5-ui.mjs) · [Workspace repair](../backend/tests/test_workspace_repair.py) |
| BASE-05 | Preserve canonical routing, concurrent cache ownership, Yahoo request budgets, Hyperliquid stream bounds and owned backend shutdown. | Shared and Mac, with native Windows process checks pending. [Direct history](../backend/tests/test_direct_history.py) · [Provider routing](../backend/tests/test_provider_routing.py) · [Streams](../backend/tests/test_hyperliquid_stream.py) · [Owned backend](../scripts/owned-backend-process.mjs) |

## Phase 1 · Advanced Chart Grid

Run `node scripts/chart-grid-unit.mjs`, `node scripts/chart-grid-ui.mjs` and `backend/.venv/bin/python -m pytest backend/tests/test_workspace_repair.py -q -rs`. The macOS runner includes both Grid scripts. The UI benchmark writes `test-results/chart-grid-performance.json` with initial and new-timeframe measurements, navigation and page returns from cache, provider deltas, chart counts, and renderer memory before and after 20 cycles. The diagnostics use synthetic market data in disposable profiles. The final packaged candidate requires its own live acceptance.

| ID | Deterministic case and pass condition | Surface |
| --- | --- | --- |
| G1-01 | Open dedicated Grid from navigation, watchlist individual and selected batch, then one screener result. Canonical ID and supported timeframe are preserved. Duplicate, unresolved, unsupported and over-cap entries produce a defined result and preserve order. Ordinary Chart and watchlist actions still function. | Shared, Mac UI, Windows UI |
| G1-02 | Test eight cards on a full page and a 128-card input limit. Arrange responsive columns and sizes, page by mouse/keyboard, maximize and restore one card. Mount at most eight cards, one when maximized, and restore page position and focus. Verify narrow and high-DPI viewports. | Mac and Windows UI |
| G1-03 | Switch canonical symbols, intervals and settings amid delayed responses. Replace a removed card before its previous response completes. Late results never paint the wrong chart. One supported overlay agrees with an existing numerical fixture. Stale, empty, error and unsupported inputs remain distinguishable. | Shared and Mac UI |
| G1-04 | Spy on work scheduled per card, cache keys and upstream requests. Compatible history requests coalesce. Different canonical ID, timeframe, adjustment and window inputs do not share incompatible answers. Limit active new Grid history operations to two and hidden cards to zero. Maintain the existing Yahoo budget under concurrent Charts/screener demand. | Shared backend and UI |
| G1-05 | Cycle page, maximize, route, and remount at least 20 times, including cancellation while data is pending. Compare mount, listener, timer, subscription and owner counts with the corresponding quiescent state and inspect RSS trends. Warm eight-card Grid restore records latency with upstream delta zero. Report individual runs, median and maximum before selecting a Grid-specific limit. Run BASE-02 independently. | Shared lifecycle, Mac performance and Windows lifecycle |
| G1-06 | Open a legacy workspace, configure Grid, close and reopen on a disposable profile. Confirm validated state persists without bars or secrets. Inject invalid, over-limit and unknown fields and check safe fallbacks. Verify existing Charts and alerts retain state. | Shared schema, Mac and Windows packaged |

## Phases 2–5 · Market analysis and chart reuse

| ID | Deterministic case and pass condition | Surface |
| --- | --- | --- |
| HM-01 | Build a mixed stock/index/crypto fixture. Assert category and sector/unclassified grouping, equal-weight areas, stable search/filter/sort, accessible keyboard traversal and chart handoff by canonical ID. | Shared, Mac and Windows UI |
| HM-02 | Assert known changes from prior close or completed endpoints for each supported timeframe. Verify timestamp/provenance and distinguish delayed, stale, unavailable and zero. Unsupported horizons are unavailable and issue no requests. | Shared, Mac UI |
| HM-03 | Compare verified capitalization weights with named source, as-of and currency basis. Missing/unverified caps never become invented values. Partial coverage and fallback are visible. | Shared, Mac UI |
| HM-04 | Open/close and filter a reference universe with deferred batches. Assert bounded/coalesced refresh, cancellation, no per-tile request fan-out and no cross-view stale updates. | Shared, Mac UI |
| PAT-01 | Assert weekday/session/window counts, mean, median, positive/negative/flat distributions and sample totals against independently calculated fixtures. Cover empty, single and even sample cases. | Shared numerical |
| PAT-02 | Include DST gap/fold, holiday, early close, overnight and 24/7 fixtures. Compare exchange-local boundaries, timezone and session fallback. Missing endpoints and incomplete bars reduce coverage with an explicit reason. | Shared numerical, Mac and Windows timezone |
| PAT-03 | Page occurrences and jump to the exact instrument and timestamp with no off-by-one boundary. Export statistics, basis and coverage through the explicit save flow and neutralize formula cells. | Mac and Windows UI |
| PAT-04 | Exercise max-range and max-observation behavior with cancelled and failed data loads. Preserve responsiveness, cap provider requests and leave no stale results after changing inputs. | Shared, Mac performance |
| SC-01 | Round-trip existing nested groups and presets. Verify new typed comparisons, bounded depth/nodes, invalid parameters and true/false/unknown semantics including insufficient history. Reject executable input. | Shared numerical, Mac UI |
| SC-02 | Complete, cancel and partially fail jobs. Ensure a single active scan, at most two history workers, progress bounded/monotonic and release of cancel ownership, with other Yahoo consumers obeying the shared budget. | Shared, Mac UI |
| SC-03 | Restart after persisted scans. Load paginated time/config/status/result snapshots without a provider call. Confirm retention and interrupted-transaction behavior and preserve provenance and prior presets. | Shared SQLite, Mac and Windows packaged |
| SC-04 | Filter/sort rows and hand off to watchlist and Grid without losing canonical identity, result interval or status. A watchlist revision conflict leaves the original list intact and reports a recoverable conflict. | Shared and native UI |
| TMP-01 | Save, preview and apply indicator, appearance, drawing style and layout templates. Fields round-trip, incompatible anchors are rejected or explicitly re-anchored, and scoped application retains other workspace data. | Shared, Mac and Windows UI |
| TMP-02 | Import/export UTF-8 with safe native dialogs. Reject oversized, nested, future-version or malformed files, unsafe paths and arbitrary source. A rejected import leaves the prior state intact. | Shared, Mac and Windows packaged |
| TMP-03 | Migrate legacy workspace/template fixtures and re-open across supported versions as documented. Confirm defaults, preserved indicator IDs, existing drawing bindings and no silent layout collapse. | Shared, Mac and Windows packaged |
| TMP-04 | Apply max-size templates while Charts is active. Confirm bounded UI work and zero provider requests unless an explicit symbol/interval change needs data. | Shared, Mac performance |

## Phases 6–8 · Authoring and simulation

| ID | Deterministic case and pass condition | Surface |
| --- | --- | --- |
| PY-01 | Validate source syntax and typed parameters, immutable revisions and named configurations. Reject invalid bounds and produce consistent diagnostics. Reopen local saved revisions. | Shared and native UI |
| PY-02 | Run controlled programs against deterministic inputs and assert plots, markers and bounded tables agree with a fixture. Reject invalid lengths, NaN/infinity, payloads and unapproved IPC messages. | Shared, Mac and Windows packaged |
| PY-03 | Packaged worker probes cannot access unrestricted files, profiles, credentials, network, child processes or inherited app handles. Missing or invalid OS containment fails closed. | Native Mac ARM64 and Windows x64 required |
| PY-04 | Exceed CPU, memory, wall time and output independently. Deadlines/cancel/parent shutdown stop the full worker lifecycle, return typed errors and leave the main application responsive. | Native Mac ARM64 and Windows x64 required |
| PY-05 | Verify reproducible source hashes and separate Pine feasibility decision. Compatibility claims require representative semantics, dependency and licensing evidence. | Review and shared contract |
| BT-01 | **After approval.** Golden trades verify capital, long/short sizing, fees, slippage, gap fills and stop/target precedence against independent calculations. | Shared numerical |
| BT-02 | Mutate only future fixture bars and confirm earlier signals/fills are invariant. Test completed candles, warmup, missing data and consistent time alignment. | Shared numerical |
| BT-03 | Assert ledger, equity, drawdown, profit factor and win rate. Define no-trade and no-loss behavior without dividing by zero. Match entry/exit markers and export provenance. | Shared, Mac and Windows UI |
| BT-04 | Reload a versioned run with matching source/data digest and reproduce it. Report a differing or unavailable dataset explicitly. Check cancellation, progress, caps and shutdown. | Shared, Mac and Windows packaged |
| BT-05 | Verify the operation is a historical-only analysis and has no broker, order placement, automated live access, streaming execution or credential scopes. | Review and shared contract |
| OPT-01 | Verify complete bounded grids and seeded sampled searches. Duplicate inputs produce stable trial order and evaluated parameters. A single immutable dataset serves all trials with no per-trial provider calls. | Shared numerical |
| OPT-02 | Verify chronological splits, gaps/warmup and strict holdout isolation. Reference walk-forward fold outputs and selection stability under altered held-out data. | Shared numerical |
| OPT-03 | Verify risk/performance metrics, sample-size/overfitting warnings, heatmap values and precise selected trial provenance. | Shared, Mac and Windows UI |
| OPT-04 | Enforce workload caps, bounded concurrency and prompt cancellation. Persist result status without a compile/build/install step or runaway resource allocation. | Shared, Mac performance, Windows lifecycle |

## Phases 9–10 · Reports and local commands

| ID | Deterministic case and pass condition | Surface |
| --- | --- | --- |
| REP-01 | Save/reopen local reports with multiple supported blocks. Preserve source/coverage/metric versions and stable IDs. Missing or stale data is explicit. | Shared and native UI |
| REP-02 | Scan and pattern fixture results map exactly to saved sections. Backtest and optimizer sections appear only after approved integration and carry their original immutable run identity. | Shared |
| REP-03 | Render/export analytic input containing script markup, event attributes, external resource URLs and formula prefixes. Output remains non-executable and script-free, makes no external fetch, and preserves safe text. | Shared and native packaged |
| REP-04 | Verify native save/cancel, encoding, export caps, local profile isolation and permitted data fields with large or missing charts/assets. | Mac and Windows packaged |
| AI-01 | Command registry and generated help/skills agree on schemas, versions, capabilities, errors and disabled flags. Accessible commands reflect the authenticated profile and active edition of the local contract. | Shared command contract |
| AI-02 | Deny unauthenticated or wrong-profile requests, stale/revoked tokens and disallowed methods. Block endpoint impersonation in native transport tests. Confirm private backend secrets never leave their existing boundary. | Native Mac and Windows required |
| AI-03 | Read-only behavior is default. Mutations require the correct scoped grant and applicable consent. Verify revocation and no generic JS, shell, proxy or raw credential surface. | Shared and native packaged |
| AI-04 | Repeat a mutation with one key concurrently and after restart. One state change occurs and authorized identical retries receive the stored result. Payload conflicts fail and profile/principal isolation holds. Inject failure between write/receipt steps. | Shared SQLite and native packaged |
| AI-05 | Validate bounded request/result sizes, structured error redaction, deadlines, revocation races, quota exhaustion and audit retention. Read operations respect market data budgets. | Shared and native lifecycle |
| AI-06 | Disable external integration and verify all ordinary application workflows work offline with fixture data and without an external account or AI dependency. | Mac and Windows UI |

## Phases 11–12 · Performance and release

| ID | Deterministic case and pass condition | Surface |
| --- | --- | --- |
| PERF-01 | Repeat strict BASE-02 across warmed isolated profiles. Record individual times, median/max, provider deltas and schedule/resource context. Separate cold restores and invalid cache setups as distinct scenarios. | Mac, CI and native Windows observations |
| PERF-02 | Profile feature navigation, eight visible charts, scrolling/focus and lifecycle churn on 8 GB. Capture memory/CPU and chart/observer counts with defined tasks, and resolve sustained growth or responsiveness regressions before approval. | Mac native and Windows |
| PERF-03 | Verify cold and warm startup, backend ownership, forced failure, normal shutdown, sleep/resume and no surviving owned processes after quit. | Native Mac and Windows |
| PERF-04 | Exercise Hyperliquid connect/disconnect/reconnect, idle disposal, quota bursts and Yahoo cache/stale fallback without duplicate upstream work. Record provider deltas. | Shared, Mac, Windows lifecycle |
| PERF-05 | Verify SQLite integrity, transaction interruption, migration/recovery on a copied profile and a long-running mixed workload with bounded cache/CPU/memory. Repeat full baseline. | Shared, Mac and Windows |
| REL-01 | Confirm approved integrated GitHub SHA, official remote/clean workspace and required CI. Build unique artifacts at that revision and verify checksums, embedded SHA, native ARM64, signature, bundle identity and updater policy. | GitHub and Mac |
| REL-02 | Verify packaged startup, core fixture workflows, provider-specific approved live smoke checks and owned backend shutdown on native Apple Silicon using disposable profiles. Record provider freshness/coverage and feature limitations separately. | Mac native |
| REL-03 | Verify Windows x64 setup and portable versions, identity/updater behavior, profiles, DPI, window/notification controls and owned process lifecycle. Update the Windows pending status from actual native evidence. | Windows native required |
| REL-04 | After exact install approval, verify profile backups and rollback artifacts, install the approved candidate and confirm its identity, launch and user-data continuity. Check preserved databases, watchlists, drawings, alerts, settings and exports. | Approved Mac and applicable Windows workflow |
| REL-05 | Reconcile distribution inputs, embedded licensing and public packaging gates before any separately approved distribution. Verify recovery and process/history safety for inventory items and remove only approved obsolete artifacts. | Review, native release evidence |

The [gap analysis](ADVANCED_FEATURE_GAP_ANALYSIS.md) maps tests to source paths and feature risks. The [roadmap](ADVANCED_DEVELOPMENT_ROADMAP.md) defines the proposed phase order, Phase 1 limits and approval dependencies.
