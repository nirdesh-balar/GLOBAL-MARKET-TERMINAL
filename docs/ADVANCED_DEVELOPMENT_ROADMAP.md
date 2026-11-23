# Advanced Development Roadmap

Phase 0 proposal · 23 November 2026

The starting point is official main `f53b57f84b7ff4cac784f54856a47292cc4a8a9c` and the verified installed 1.1.0-rc.7 ARM64 bundle with Electron 44.11.5. The roadmap adds increments to GMT's current project and profile model. Feature boundaries and source evidence are in the [gap analysis](ADVANCED_FEATURE_GAP_ANALYSIS.md). Acceptance and release evidence are in the [test matrix](ADVANCED_FEATURE_TEST_MATRIX.md).

## Recommended sequence

Numbers describe review order. A technically blocked phase can remain open while separately approved independent work moves forward. Security, numerical correctness and resource checks start in the phase that introduces the relevant surface.

| Phase | Proposed increment and exit | Dependencies and approval | Complexity |
| --- | --- | --- | --- |
| 0 · Research | Compare current code and test evidence to requirements, document gaps and propose acceptance. | Local research branch review. | Complete on delivery |
| 1 · Chart Grid | Dedicated paged Grid, typed watchlist/scanner handoff, card controls, lightweight studies, maximize and lifecycle budgets. | Phase 1 approval and existing chart/history contracts. | Medium |
| 2 · Heatmap | Equal-weight category view first. Add sector, historical horizons and cap weight only for covered data with verified semantics. | Provider metadata/terms review. Phase 1 supplies optional Grid handoff. | Medium to high |
| 3 · Patterns | Weekday and exchange-local session windows with statistics, coverage, occurrence navigation and export. | Validated calendars and available historical resolution. | Medium-high |
| 4 · Scanner | Extend existing nested conditions and asynchronous jobs with new typed comparisons, durable history and Grid handoff. | Phase 1 for Grid. History and custom typed rules use the existing screener. | Medium |
| 5 · Templates | Reusable indicator, drawing, layout and appearance records with guarded import and export. | Existing layout schema. Phase 1 for Grid-related templates. | Medium |
| 6 · Python Studio | Review threat model and native worker proof first. Stage the editor, revisions and output schema, then enable execution only after native containment evidence. | Packaged sandbox proof on macOS ARM64 and Windows x64. Pine compatibility scoped separately. | Very high |
| 7 · Backtesting | Build a deterministic historical engine with explicit fill assumptions, costs, immutable evidence and chart markers. | Separate strategy simulation approval. Phase 3 session semantics inform the engine. Typed built-in rules can run independently of Phase 6. | High |
| 8 · Optimizer | Bounded parameter search, deterministic seeds, holdout and walk-forward evaluation. | Phase 7's verified engine and datasets with enough coverage. | High |
| 9 · Reports | Local report studio with provenance and safe exports. Start with existing indicators and stable scanner/pattern summaries. | Phases 3/4 for those report inputs, 7/8 for simulation results. | Medium |
| 10 · GMT AI | Optional local read-only CLI/registry and discovery. Deliver revocable mutations as a separately reviewed increment. | Stable feature contracts and native local authentication. Consent, atomic replay and audit gates before enabling mutations. | High |
| 11 · Optimization | Profile and resolve measured resource and lifecycle problems. Run the full packaged regression set. | Approved feature set and representative 8 GB and Windows evidence. | High |
| 12 · Release | Verify and synchronize the exact integrated revision, then confirm native artifacts, profiles, rollback and scope approvals. | Phase 11, Windows x64 availability and separate integration, install, cleanup and publication decisions. | High |

## Phase 1 scope for approval

### User workflow

1. Open the dedicated Chart Grid from the desktop navigation. The existing multi-pane Charts workspace keeps its layout, pane identities, studies, drawings, synchronization and ordinary links.
2. Add canonical instruments from a watchlist, an explicit selected watchlist batch or a screener result. Keep order and retain scanner timeframe where supported. Default individual new cards to daily when no interval is supplied. Report duplicates, unresolved identities, unsupported intervals and any skipped excess.
3. Set responsive columns and compact or comfortable card size, and choose each card's instrument and timeframe. Provide one existing moving-average overlay family, a focused maximize/restore action and keyboard navigation. Render individual data/loading/stale/error states.
4. Page through cards and reopen the saved Grid settings in a disposable profile. Restore focus when closing maximize or returning from another surface. Keep the active Charts workspace, alerts and scanner jobs independent.

The first increment uses cached historical snapshots with explicit as-of data. Grid streaming, chart drawing editing, linked synchronization, bulk background refresh, heatmaps, template management, new providers and new execution features are assigned to other work or excluded. Chart Grid can use existing provider reads through the established authenticated path without adding a backend market-data endpoint. A versioned profile field and validation changes may be needed for saved Grid state.

### Proposed implementation limits

| Parameter | Initial contract |
| --- | --- |
| Grid state | A maximum of 128 stored card descriptors. Persist canonical identity, supported interval and view preferences with bounded validation and legacy defaults. Keep bars and provider secrets out of workspace state. |
| Visible resources | Four cards per default page. At most eight mounted charts, and at most one while maximized. Remove page/navigation/maximize-hidden charts and release observers, timers, listeners, renderers and owned history references. |
| Fetch policy | At most two new Grid history operations active at a time, queued by visible demand. Deduplicate compatible requests with the shared renderer/history services and retain the backend provider budget. Hidden or removed cards initiate zero requests. A shared fetch may continue while another live subscriber owns it. |
| Identity and data | Keep canonical identity, interval, adjustment and time-window semantics in request keys. Validate interval/provider support and reject or describe unavailable coverage. |
| Performance | The current Charts warm layout remains strictly below 2,000 ms with zero additional provider requests. In a separate deterministic warmed-cache Grid fixture, eight visible cards must render below 2,000 ms on the target Mac with zero additional upstream requests. Capture independent cold/warm timings, provider deltas, mount counts and RSS. |
| Native validation | Repeat the lifecycle test over at least 20 controlled transitions. Record all individual timings, median and maximum. Compare resource counters after equal quiescent states. Run keyboard and resizing tests on Mac, with corresponding Windows x64 DPI and keyboard cases pending native execution. |

Implementation starts by identifying the smallest reusable renderer and history ownership contract. The first reviewable change should cover navigation, one visible card, watchlist and result handoff, and disposal. Add paging, card settings and overlays once those lifecycles pass. Acceptance requires G1-01–G1-06 and BASE-01–BASE-05 as applicable. [Test matrix](ADVANCED_FEATURE_TEST_MATRIX.md)

## Decision gates

| Gate | Required evidence | If unmet |
| --- | --- | --- |
| Providers and redistribution | Existing Hyperliquid/Yahoo Finance scope, explicit NSE directory/archive provenance, published metadata basis and measured coverage. Review terms for caching and exports. | Hide unsupported horizons/weights, omit unverifiable metadata, or defer the affected export. Additional providers require explicit approval. |
| Untrusted Python | Packaged native proof of denied network, sensitive files, credentials, inherited handles and child process access. Confirm deadlines and resource termination. | Keep author-code execution unavailable. Treat Pine feasibility as separate. |
| Historical simulation | Approval covering analytical scope and execution model. Independently checked accounting and look-ahead fixtures. | Hold simulation and dependent optimization. Reports can still use other data. |
| Local agent bridge | Authenticated native transport with profile isolation, narrow operations and bounded output. Consent, revocation, retry safety and audit for mutations. | Keep affected commands disabled. |
| Performance | Native fixture results, comparable timestamps and upstream counter deltas, no weakened gate. | Diagnose the specific bottleneck and preserve the strict limit. |
| Native installation and distribution | Approved source and exact candidate, platform evidence, signing/update policy, profile backup, verified rollback and itemized cleanup. Reconcile current public package inputs and authorization before any publication. | Keep current installation and preserve the verification record. |

## Workflow for every approved implementation phase

1. Fetch official main and record remote, clean/dirty status, source SHA and installed identity. Read [AGENTS.md](../AGENTS.md) and affected docs. Create a dedicated task branch and preserve local histories and profiles.
2. Confirm actual behavior and measurable acceptance on the existing interfaces. Implement the smallest compatible change with deterministic backend and UI tests. Keep dependencies locked and market data, credentials, user state and evidence out of commits.
3. Run required shared checks and affected macOS native tests, including appropriate packaged tests on Apple Silicon. Use isolated profiles and fixture providers for deterministic checks. Separate approved live evidence from fixture results. Record exact SHA, test counts, skipped checks, measured values and failures. [Testing](TESTING.md)
4. Update project records and Windows pending entries for changed behavior. Prepare the reviewed official PR after source push approval and require applicable CI. Keep platform configuration evidence and native Windows execution evidence distinct. [Windows pending](WINDOWS_PENDING.md)
5. Obtain applicable integration approval and verify the exact integrated main SHA. Build a uniquely named, checksummed native candidate only when a package is required. Preview the install, profile protections and rollback path, then obtain installation approval. Keep approved deletion and public binary publication separate. [Build](BUILD.md) · [Release gates](RELEASING.md) · [Mac release status](MAC_RELEASE_STATUS.md)

The Phase 0 branch contains documentation only. Current native Windows backlog includes `WIN-ELECTRON44` for integrated rc.7 and Electron 44.11.5. Use dedicated future entries for Grid DPI, file handling, containment and local transport after those changes exist. [Windows pending](WINDOWS_PENDING.md)
