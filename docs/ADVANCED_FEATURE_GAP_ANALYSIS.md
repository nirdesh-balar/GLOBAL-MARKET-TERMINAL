# Advanced Feature Gap Analysis

Phase 0 research baseline · 23 November 2026

## Verified baseline and evidence

| Surface | Verified state |
| --- | --- |
| Official and local GMT main | Clean local main and remote main at `f53b57f84b7ff4cac784f54856a47292cc4a8a9c`. [Official revision](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/commit/f53b57f84b7ff4cac784f54856a47292cc4a8a9c) |
| Installed application | `/Applications/GLOBAL MARKET TERMINAL.app` contains the same source SHA, app version 1.1.0-rc.7 and Electron 44.11.5 ARM64. Strict bundle signature verification passed. The app reports the personal updater policy as `blocked-unsigned`. Phase 0 used static bundle inspection. |
| Existing test evidence | Post-merge CI run 45036636194 passed on attempt 2 at the same SHA. The successful attempt reported 2,419 Python passes and one optional skip, 31/31 macOS UI scripts and 18/18 numerical scripts. The original warm layout was 2,173 ms and the retry was 1,930 ms with zero additional provider requests. The available evidence does not establish a root cause for the first measurement. [Run history](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45036636194) |
| Functional baseline | 69 indicators, 86 drawing tools, 59 screener conditions, a multi-pane chart workspace, historical screener, watchlists, alerts and chart replay. Shared macOS ARM64 and Windows x64 source. Windows native validation of the integrated Electron revision remains pending. [Windows pending](WINDOWS_PENDING.md) |
| Reference revision | Existing separate TradingLead Skills checkout and remote main at `c9a9f4eb4c0e719e13a097878870d781f0f1f37c`. Static review covered the README, generated commands, catalog, all 15 skills, workflow notes, 21 YAML suites, and validation, distribution and installation tooling. [Pinned reference repository](https://github.com/Shubham-vish/tradinglead-skills/tree/c9a9f4eb4c0e719e13a097878870d781f0f1f37c) |

The analysis uses an Apple M2 Mac with 8 GB of unified memory as the resource target. Phase 0 reports prior CI measurements and does not claim fresh runtime benchmarks. Feature proposals use the existing React/Electron and Python/SQLite boundaries. Apple Silicon is the first native validation target, while release acceptance also requires native Windows x64 evidence.

### Reference architecture and limits

The pinned `isolated-source` catalog describes 286 commands, including 226 canonical commands and 60 aliases. Its descriptors include 67 desktop controls and 147 commands marked as mutating. The catalog and generated command reference take precedence over the README's rounded or outdated command count. The bundle manifest records revision 9, minimum desktop 0.1.17, maximum desktop exclusive 0.2.0, CLI API 1 and bridge protocol 2. Its latest bundle hash matches the manifest. These are source and artifact checks. Command descriptors, permission descriptions and YAML scenarios do not establish runtime availability. [Catalog](https://github.com/Shubham-vish/tradinglead-skills/blob/c9a9f4eb4c0e719e13a097878870d781f0f1f37c/command-catalog.json) · [Command reference](https://github.com/Shubham-vish/tradinglead-skills/blob/c9a9f4eb4c0e719e13a097878870d781f0f1f37c/COMMANDS.md)

The reference tools check command aliases, schemas, documented examples, links and mutation retry keys. The YAML runner defines command, workflow and state checks, bounded polling, read-only modes and optional evaluators. Distribution is versioned and the optional installer links skills into a user skills directory. The documented bridge uses application capability discovery and distinguishes tab scope, local changes, indicator operations and signed-in features. GMT can independently adopt the ideas of a typed registry, discovery and contract fixtures. The reviewed checkout did not expose a tracked license grant for reuse. The design depends on public behavior descriptions only, with no runtime, copied code, assets, cloud features, user-skill installation or third-party access. [Reference repository and tooling](https://github.com/Shubham-vish/tradinglead-skills/tree/c9a9f4eb4c0e719e13a097878870d781f0f1f37c)

| Reference module | Observed workflow and GMT disposition |
| --- | --- |
| `tl-alerts` | Create and manage notifications. Existing GMT alerts remain a baseline regression surface. Hosted alert workflows are out of scope. |
| `tl-backtesting` | Define, configure, run, compare and inspect historical simulations. Reference for Phase 7 navigation and evidence. |
| `tl-charts` | Select a pane, apply a layout, manage studies and templates. Reference for Phases 1 and 5. |
| `tl-desktop` | Discover tab-scoped commands and workspace capabilities. Reference for Phase 10 discovery. Generic native input is outside scope. |
| `tl-markets` | Use watchlists, categories and current-quote heatmaps. Reference for Phases 1 and 2. The public command notes do not establish historical heatmap support. |
| `tl-paper-trading` | Simulated session management. Outside Phase 7, whose scope is reproducible historical analysis. |
| `tl-patterns` | Inspect weekday and intraday occurrences, sample coverage and exchange-local windows for supported instruments. Reference for Phase 3. |
| `tl-portfolio` | Read live account data and manage orders. Outside GMT scope. |
| `tl-python` | Manage source revisions, input schemas and named configurations. Reference for Phase 6 workflow. Worker containment requires independent native verification. |
| `tl-research` | Create, preview and save reports, with distinct local and hosted behaviors. Reference for Phase 9 local reports. |
| `tl-screening` | Draft and validate conditions, preview a scan, execute, poll, cancel and view prior results. Reference for Phase 4 lifecycle. |
| `tl-strategy-optimization` | Preview budgets, search parameters and inspect out-of-sample results. Reference for Phase 8. |
| `tl-strategy-research` | Connect hypotheses, configurations and evidence. Reference for Phase 9 provenance. |
| `tl-testing` | YAML command, state, visual and workflow contracts. Reference for Phase 10 deterministic tests and for regression planning across phases. |
| `tl-tlscript` | Discover a documented Pine-related subset and availability. Separate feasibility and licensing review for Phase 6 follow-up. |

## Phase 1 · Advanced Chart Grid

**Classification.** The 1/2/4/6/8 chart workspace, pane symbol/timeframe controls, chart studies, maximize and chart history caching are already implemented in the main workspace. Watchlist and screener handoff are partially implemented through the ordinary chart workspace. A separate responsive Grid, new handoffs, Grid-specific card dimensions and overlays, paging and lifecycle enforcement are new or require enhancement.

**GMT and reference.** [App](../desktop/src/App.tsx), [ChartPane](../desktop/src/charts/ChartPane.tsx), [watchlists](../desktop/src/components/WatchlistSidebar.tsx), [scanner results](../desktop/src/screener/ScreenerResults.tsx), [renderer data client](../desktop/src/services/api.ts), [history service](../backend/app/history.py), [provider budget](../backend/app/request_budget.py). The reference chart and market modules illustrate selected chart targets and watchlist navigation.

**Original implementation.** Add one Grid destination with data-only card records and scoped preferences. Accept compatible single selections and ordered explicit batches from watchlists and scan snapshots by canonical ID. Expose responsive columns, compact/comfortable card size, symbol and interval per card, optional lightweight moving averages, and maximize/restore. Use pagination with a bounded visible set and error, loading and stale states per card. Share focused chart lifecycle and history logic where practical. Dispose on paging, navigation and single-card maximize, and reject late completions for removed cards. Preserve the previous page and card position on restore.

**Data and resource envelope.** Route through the existing authenticated history path. Reuse in-flight deduplication, the existing cache key and shared Yahoo budget. Daily history is the default. Select supported intervals and retain provider/adjustment/date-window identity. A hidden card issues no requests and owns no canvas, timer, listener or stream. Keep Grid streaming out of the first increment. Use bounded stored descriptors, visible instances and concurrent fetches on 8 GB. Persist only validated layout/identity settings within the profile. Windows uses the shared renderer and existing profile API, with native DPI and keyboard tests pending.

**Dependencies and risk.** No new phase dependency. Medium complexity, with lifecycle leaks, unstable keys, stale async results and competition with active charts as the principal risks. Verify G1-01–G1-06 and BASE-02 in the [test matrix](ADVANCED_FEATURE_TEST_MATRIX.md).

## Phase 2 · Market Heatmap

**Classification.** Market identity, category, quote batching and watchlists are already implemented. A user-facing market/sector treemap, metric/timeframe controls, tile filtering/sorting and tile drilldown are new. Verified sector and market-cap coverage is technically blocked wherever the approved data sources lack suitable metadata.

**GMT and reference.** [Markets](../backend/app/markets.py), [registry](../backend/app/registry.py), [discovery](../backend/app/discovery.py), [refresh](../backend/app/refresh.py), [market types](../desktop/src/types.ts). The reference market workflow groups current quotes and opens a selected symbol. Historical horizon calculations require a separate data and semantics check.

**Original implementation.** Build an accessible tile view with stock, index and crypto filters, search, stable sorting, explicit unclassified groups, chart links and a keyboard-readable list. Derive comparable percent changes from a documented prior close and current/as-of value or from two completed bars on supported horizons. Track source, calculation basis, timestamps and freshness. Start with equal weights. Validate a market-cap source, currency conversion policy and snapshot coverage before enabling cap sizing. Handle missing, stale and unavailable percentages separately and distinguish baskets, instruments and indices.

**Data and resource envelope.** Batch existing quotes for a bounded selected universe, then lazily use bounded history where the horizon is supported. Coalesce refreshes, avoid per-tile timers and equalize metadata-independent views. Keep source claims and provider terms explicit, including delayed Yahoo and crypto venue distinctions. Validate filter inputs and avoid storing credential or raw bar snapshots in reports by default. Shared rendering supports Windows with native scaling, fonts and accessibility verification.

**Dependencies and risk.** Core heatmap can link to the existing Charts view, with Phase 1 adding optional Grid handoff. Medium complexity for equal weight and high data risk for verified cap/sector and historical coverage. Verify HM-01–HM-04.

## Phase 3 · Historical Patterns

**Classification.** History aggregation, market time display, session calendars and manual replay are existing primitives. Weekday, custom intraday and session statistics, occurrence drilldown and analytical export are new.

**GMT and reference.** [Sessions](../backend/app/sessions.py), [aggregation](../backend/app/aggregator.py), [market time](../desktop/src/services/marketTime.ts), [ReplayControls](../desktop/src/charts/ReplayControls.tsx), [history](../backend/app/history.py). The reference patterns workflow illustrates exchange-local weekdays, selected windows, coverage and individual occurrences.

**Original implementation.** Build a bounded, typed analytics request for one canonical instrument, a date range and a weekday/session/window policy. Compute returns with an explicit open/close and adjustment basis, positive/negative/flat counts and distributions, arithmetic mean, median, sample size and completeness. Exclude incomplete or missing endpoints with reason counts. Report the exchange timezone and session definitions used. Use paged occurrence results, a chart jump by timestamp and a structured CSV export through the existing native save boundary.

**Data and resource envelope.** Require approved historical coverage and reliable exchange-local intervals. Document digital asset sessions, DST, half-days, holidays, overnight boundaries and unknown calendars. Cap range and observations, reuse sorted series, compute summaries off the renderer and limit exported rows. Escape spreadsheet formulas and include provenance. Ship matching timezone-data support and fixture checks on both platforms.

**Dependencies and risk.** Independent of Phase 2. Phase 9 consumes its analytical result schema. Medium-high complexity, mainly around partial history, timezone rules and numeric correctness. Verify PAT-01–PAT-04.

## Phase 4 · Advanced Scanner

**Classification.** Nested AND/OR, 59 configurable technical conditions, saved presets, result filtering/sorting, watchlist actions, bounded background fetching, cancellation and progress are already implemented. Existing ephemeral job records offer partial scan history. Durable history, Grid handoff and new custom rules beyond the registered catalog require enhancement.

**GMT and reference.** [ConditionBuilder](../desktop/src/screener/ConditionBuilder.tsx), [results](../desktop/src/screener/ScreenerResults.tsx), [screener jobs](../backend/app/screener.py), [condition validation and evaluation](../backend/app/screener_conditions.py), [live analysis](../backend/app/live_analysis.py). GMT already validates recursive groups with depth/node limits and evaluates three-valued logic. The reference screener describes draft, catalog, progress, cancel and history workflows.

**Original implementation.** Extend the current screener. Add selected domain-specific comparisons over a small typed allowlist, with validation and existing unknown/missing/failure semantics. Persist compact versioned scan history in SQLite with explicit retention, the configuration used, timestamps, provider provenance, outcome, counts and bounded result snapshots where permitted. Open saved history without rerunning the scan. Use atomic revisioned watchlist writes and a typed Phase 1 Grid handoff. Keep prior presets and catalog parameters valid.

**Data and resource envelope.** Preserve the single active scan, two history workers and shared request budget. Page history and results, cap retained job data, cancel on demand, and keep renderer updates bounded. Use the approved provider and candle basis, label partial or stale data, and prevent arbitrary expressions or author-supplied execution. SQLite persistence uses the existing profile abstraction. Exercise native Windows cancellation and restart persistence.

**Dependencies and risk.** Phase 1 is required for Grid handoff. Built-in rule expansion and history are independent of Phase 6. Medium complexity, with risk in retention, snapshot semantics and preserving current presets. Verify SC-01–SC-04.

## Phase 5 · Chart Templates

**Classification.** Indicator presets, drawing persistence, per-pane appearance and persisted layouts are already implemented. Named reusable drawing/layout/appearance templates and safe import/export are new or enhancements.

**GMT and reference.** [Workspace schema](../backend/app/models.py), [IndicatorManager](../desktop/src/components/IndicatorManager.tsx), [ChartSettings](../desktop/src/components/ChartSettings.tsx), [drawing registry](../desktop/src/drawings/registry.ts), [native file flow](../desktop/electron/watchlistFiles.ts). The reference charts workflow separates template operations from active chart selection.

**Original implementation.** Define a small, versioned, typed library for indicator configurations, layout geometry, appearance, and eligible reusable drawing styles. Mark anchor-bearing drawings explicitly and require compatible targets or explicit re-anchoring. Reuse existing structures, expose previews/apply-one-or-many, and apply atomically with predictable merge/replace. Add validated native JSON file import/export and backwards-compatible workspace repair. Keep a reviewed migration and conflict policy.

**Data and resource envelope.** Template records contain configuration and stable identifiers. Bound file size, nesting, asset count and numeric inputs. Exclude tokens, paths, arbitrary source, scripts and external resources. Keep preview bounded and apply a template without provider reads except when the user intentionally changes the requested symbols or intervals. Cross-platform JSON is UTF-8 with native dialog tests and Windows filename rules.

**Dependencies and risk.** Legacy chart templates can precede Phase 1; Grid templates require its schema. Medium complexity, with compatibility risk around drawings, future schema versions and partial application. Verify TMP-01–TMP-04.

## Phase 6 · Python Indicator Studio

**Classification.** Built-in indicator engines, trusted chart plots and analytic primitives exist. User editor, named configurations, local source/revision library, custom plots/markers/tables and arbitrary user code execution are new. Runtime is technically blocked until containment is verified on both target platforms. Pine compatibility requires a separate feasibility and licensing decision.

**GMT and reference.** [Backend indicators](../backend/app/indicators.py), [renderer custom studies](../desktop/src/charts/custom.ts), [chart integration](../desktop/src/charts/ChartPane.tsx), [reference context](../backend/app/reference_context.py), [backend launcher](../backend/launcher.py). The reference Python module illustrates revisions, typed parameters and named configurations. The reference Pine module documents a subset and access prerequisites.

**Original implementation.** Design a local, bounded editor and schema validator, immutable revisions, named parameters and typed output limits. Render validated series, markers and tables through existing presentation primitives. Isolate author code behind a separate packaged worker and a narrow broker. Supply only explicit series and configuration through length-bounded typed IPC. Candidate protections include a restrictive macOS helper sandbox and Windows AppContainer with Job Object resource controls. Verify enforcement with native probes before enabling source execution. The parser and process separation alone cannot enforce containment. [Apple App Sandbox](https://developer.apple.com/documentation/security/app-sandbox) · [Microsoft AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation) · [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)

**Data and resource envelope.** Bound rows, runs, CPU, memory, wall time and output. Revoke worker filesystem access beyond required runtime inputs and isolated scratch, network, credentials, inherited handles and child-process privileges. Kill the owned worker tree on cancellation or shutdown. Exclude native packages and unsafe deserialization from the initial design. Fail closed if controls are absent, prevent signed source permissions from cascading to the worker, and make results reproducible with source hash, input basis and engine version.

**Dependencies and risk.** Existing chart adapters underpin the proposal, with no requirement to ship execution for later phases to use built-in rules. Very high security and packaging complexity. Verify PY-01–PY-05 on both native targets before enabling arbitrary execution. Independent Pine research must assess legal reuse, language semantics and licensing before any implementation.

## Phase 7 · Strategy Backtesting

**Classification.** Chart replay, candles and existing statistics are primitives. Historical strategy simulation, persisted reproducible results and all execution metrics are new and require separate approval.

**GMT and reference.** [ReplayControls](../desktop/src/charts/ReplayControls.tsx), [chart pane](../desktop/src/charts/ChartPane.tsx), [completed-candle evaluator](../backend/app/screener_conditions.py), [history](../backend/app/history.py). The reference workflow describes definitions, configuration, runs, comparisons and ledger inspection. Real trading and paper-trading sessions are outside this phase.

**Original implementation.** After approval, build a deterministic simulation core with configuration and time-ordered events. Use typed strategy definitions, parameter schemas, initial capital, position sizing, long/short state, fees, slippage, stops and targets. Specify next-eligible fill behavior, session gaps and ambiguous stop/target ordering. Ensure decisions see only available data. Persist immutable run configuration, input identity/digest and version, trade ledger, equity, drawdown, profit factor, win rate and reproducibility status. Show chart entry/exit markers and safe exports.

**Data and resource envelope.** Require suitable completed bars, adjustment provenance, symbol constraints and currency assumptions. If provider terms prevent saving sufficient inputs, mark replay as conditional on the data digest and keep permitted user-supplied fixtures separate. Bound bars, runs, ledger and exports, support cancellation and keep the developer Mac responsive. No brokerage paths or live execution permissions are involved. Use deterministic native cross-platform fixtures.

**Dependencies and risk.** Explicit approval required. Phase 3 supplies useful session semantics; approved typed rules can ship without Phase 6. High numerical and data-availability risk. Verify BT-01–BT-05.

## Phase 8 · Strategy Optimizer

**Classification.** Bounded job progress and cancellation have existing infrastructure patterns. Parameter exploration, holdout and walk-forward evaluation, seeded sampling, heatmaps, out-of-sample metrics and warnings are new.

**GMT and reference.** [Job lifecycle precedent](../backend/app/screener.py), [data budget](../backend/app/request_budget.py). The reference optimization workflow previews compute scope, selects parameter searches and inspects in-sample/out-of-sample evidence.

**Original implementation.** Extend the approved simulation engine with deterministic grid and seeded sampled searches, previewed experiment caps and immutable datasets. Fit only on time-ordered training folds. Evaluate fixed holdouts and walk-forward folds with explicit gap/warmup rules. Show candidate distribution, risk and return metrics, optimization heatmaps and warnings for small samples, selection bias and weak out-of-sample performance. Persist ordered candidates, seeds and schema/engine identities, and support progress and cancel.

**Data and resource envelope.** Require compatible per-fold coverage and no repeated provider fetch per candidate. Reuse one bounded input, apply trial/concurrency/time budgets, aggregate metrics incrementally and keep detailed ledgers only for selected or explicitly saved candidates. Keep compute off the renderer with bounded CPU and RAM. Local job state and portable seeds must work on Windows x64.

**Dependencies and risk.** Requires approved Phase 7 with a stable engine and input contract. High compute and statistical risk. Verify OPT-01–OPT-04.

## Phase 9 · Research Report Studio

**Classification.** Candle, screener and watchlist exports plus chart snapshots already exist. Locally saved analytical reports, provenance, reusable report layouts and safe HTML are new.

**GMT and reference.** [Screener export](../desktop/src/screener/ScreenerResults.tsx), [Excel export](../desktop/electron/excelExport.ts), [workbook encoder](../desktop/src/export/excelWorkbook.ts), [native file flow](../desktop/electron/watchlistFiles.ts). The reference research workflow describes editing, preview and saving on the local device, and separately supports hosted reporting.

**Original implementation.** Store a versioned, profile-local report document with typed chart, table, statistic and narrative sections. Ingest indicator, scan and pattern summaries and add separately approved backtest or optimizer records when present. Carry source SHA, data source, timestamps, window, adjustment/coverage basis, calculation version and immutable run IDs. Render escaped text and typed blocks with safe local visuals, and write standalone script-free HTML and structured data exports through a save dialog.

**Data and resource envelope.** Default to derived results and permitted aggregates. Track stale/missing source provenance and respect provider display and redistribution terms. Bound report size and images, use incremental preview, strip unsafe URLs and raw markup, block external loads, and escape sheet formulas. Verify portable encoding, print/render behavior and native dialogs on Windows.

**Dependencies and risk.** Can begin with existing data and Phase 3/4 summary contracts. Phase 7/8 report types depend on those approvals and engines. Medium complexity with export licensing and injection risk. Verify REP-01–REP-04.

## Phase 10 · GMT AI Integration

**Classification.** Private owned backend, authenticated desktop IPC, scoped route access and a validated renderer bridge are existing primitives. An optional external-agent CLI, command registry, skills, discovery, native local authentication, consent, revocation and audit are new.

**GMT and reference.** [Electron main](../desktop/electron/main.ts), [preload](../desktop/electron/preload.ts), [backend lifecycle](../desktop/electron/backendLifecycle.ts), [launcher](../backend/launcher.py). The reference architecture describes declarative schemas, discovery, explicit write boundaries, retry keys and YAML command/workflow testing.

**Original implementation.** Build a GMT-specific, versioned registry shared by CLI validation, generated local skills/documentation and typed dispatch. Discover effective capabilities for the authenticated profile and client. Begin with read-only local commands for chart context, quotes already available in GMT, indicators and saved analytics. Apply read quotas, cancellation and timeouts. Separate interactive consent from execution for each mutating capability. Mutations use scoped grants, explicit confirmation where required, typed errors and transactional idempotency. Scope keys to principal, profile and operation, bind a normalized payload hash, reject key conflicts and persist a bounded replay record atomically with the change. Log redacted outcomes and expose revocation.

**Data and resource envelope.** Define native user-owned transport with peer authentication, profile separation and protection against endpoint spoofing. Evaluate a macOS user-domain socket and Windows named pipe with an owner ACL and peer checks. Use an independent capability credential and preserve the private backend token boundary. No arbitrary JavaScript/shell command, raw credentials, native input automation, trade actions or generic route proxy. Bound payloads, outputs, concurrent invocations and audit retention. Keep the ordinary app fully usable when the bridge is disabled.

**Dependencies and risk.** Start with stable read APIs, then add scoped surfaces as phase contracts mature. Defer mutation access until authentication, revocation, consent and atomic replay tests pass. High security complexity. Verify AI-01–AI-06.

## Phase 11 · Final System Optimization

**Classification.** Existing cache, shared budget, WebSocket owner limits, process shutdown and SQLite tests provide partial coverage. Cross-feature rendering, memory/CPU, startup/shutdown, provider-load and long-run profiling require enhancement.

**GMT and reference.** [Chart pane](../desktop/src/charts/ChartPane.tsx), [history](../backend/app/history.py), [Yahoo budget](../backend/app/request_budget.py), [Hyperliquid stream](../backend/app/hyperliquid_stream.py), [backend lifecycle](../desktop/electron/backendLifecycle.ts), [storage](STORAGE.md), [existing performance gate](../scripts/terminal-ui.mjs). The reference testing workflow suggests contract, state and workflow automation. GMT retains its native packaged regression evidence.

**Original implementation.** Profile renderer commits, chart lifecycles, active stream owners and queue pressure before applying specific changes. Capture per-run timing, median/max and provider deltas for the eight-chart restore, and native resource trends for repeated paging, navigation, idle/active streaming, cold/warm startup, suspend/resume and restart. Verify SQLite migration, transactional failure recovery and safe process shutdown. Preserve strictly less than 2,000 ms and zero additional provider requests in the existing warm gate.

**Data and resource envelope.** Use isolated synthetic/official directory fixtures and authorized live smoke tests with separate evidence. Avoid raw data and secret logging. Keep memory bounded on the 8 GB Mac, split renderer/backend RSS and record macOS and native Windows observations separately. Cross-platform thresholds require comparable packaged test methodology.

**Dependencies and risk.** Instrument and guard throughout development. Final whole-application pass follows the approved feature set. High integration risk. Verify PERF-01–PERF-05 plus BASE-01–BASE-05.

## Phase 12 · Cross-Platform Release

**Classification.** Shared source, macOS build/verification, source-SHA/vetting and pending Windows records already exist. Native Windows x64 release validation is blocked until a Windows environment is available. Packaging, installation, cleanup, source integration and publication follow their respective project approvals.

**GMT and reference.** [Build](BUILD.md), [Mac release status](MAC_RELEASE_STATUS.md), [release gates](RELEASING.md), [Windows pending](WINDOWS_PENDING.md), [license audit](LICENSE-AUDIT.md), [Mac verifier](../scripts/verify-macos.mjs). The reference manifest illustrates version/hash compatibility for its own skills bundle.

**Original implementation.** For an approved release, sync and verify the official exact source commit. Build unique checksummed candidates, verify native architecture and identity, run packaged tests with disposable profiles, and verify installed version/SHA and user-data continuity after approved installation. Preserve verified rollback artifacts and profile backups. Require Windows x64 native setup/portable isolation, window/notification and owned-process verification before claiming completion. Compare public packaging input and configured gates to current documentation before any separately approved distribution.

**Data and resource envelope.** Maintain provenance without copying profiles, cached market data or credentials into Git, release artifacts or CI logs. The public package script currently copies external NSE snapshots while build and licensing docs describe omitting them. Resolve the mismatch and validate the public release gate's historical allowlist before external distribution. Local Mac trial builds require enough disk for artifacts, profile backups and verification evidence. Keep publication independent of source integration.

**Dependencies and risk.** Depends on approved integration, Phase 11 evidence, platform availability and all relevant approvals. High release/data-continuity risk. Verify REL-01–REL-05.

## Product boundaries

GMT remains usable with local profiles and no compulsory account, subscription or AI service. Cryptocurrency remains on approved Hyperliquid identities and non-crypto history on Yahoo Finance. The existing NSE directory and explicit archive-import paths retain their separate provenance. Preserve provider quotas, identification, licensing and redistribution limits. Keep real brokers, orders and automated live trading out of scope. [Project instructions](../AGENTS.md) · [Storage](STORAGE.md) · [License audit](LICENSE-AUDIT.md)
