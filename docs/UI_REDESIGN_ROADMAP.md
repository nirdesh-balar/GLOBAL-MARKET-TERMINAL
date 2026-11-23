# Research-led GMT UI roadmap

Baseline `1.1.0-rc.8` at `a63a96cbff1b72c7cbc2e710cf3cab93d68689e2`. This proposal follows the [existing project roadmap](ADVANCED_DEVELOPMENT_ROADMAP.md). Implementation scope, source integration, packaging and installation require separate approvals.

| Milestone | Candidate scope | Exit criteria |
| --- | --- | --- |
| Reference audit | Full recording and still, control inventory, original GMT composition, analysis-only constraints, provider mapping | Traceable timestamps, measured geometry, coverage gaps labeled, reference evidence outside tracked source, and blueprint review. |
| Shell and chart workflow | Organize Charts/Grid navigation, symbol/interval controls, study/scale tools, drawing/context commands, window modes and preference persistence | Profile migrations and legacy reload pass. Existing drawing, study, export, replay and sync behavior preserved. No additional provider requests on appearance/navigation changes. |
| Dock and inspectors | Lean local watchlist, scanner, alerts and layers/data views. Existing presets, status, focus, chart/Grid handoffs and chart-price alert seed evaluation | All 59 screener conditions and existing alerts/watchlists pass parity; user controls available through keyboard, pointer and display scaling. |
| Analysis heatmap | Read-only current market return/volume view using existing approved inputs and existing budgets | Comparable sessions/metrics defined, stale and unsupported coverage visible, stable canonical selection and charts handoff. Separate from price/time liquidity. |
| Public crypto data feasibility | Bounded capture prototype for trades or public depth with fixtures and explicit feature evaluation | Public payloads and limits verified, deterministic calculations and coverage windows reproducible, known unsupported instruments fail closed. Requires separate approval. |
| Optional crypto analysis surfaces | Product-reviewed tape, sampled depth/liquidity or trade-at-price view if feasibility succeeds | Analysis-only UX, quantified resource limits, gaps and replay provenance, independent CI and packaged live verification. Unsupported options, news and execution features remain deferred. |
| Private release readiness | Source CI, Mac ARM64 validation, Windows x64 pending tests, version and rollback review | Exact SHA, artifact and test evidence, known fullscreen/focus limitation reported, profile backups and separate installation decision. |

The CI stability diagnosis proceeds independently. Confirm the normal eight-chart warm restore remains strictly under 2,000 ms with zero additional provider requests. Keep Grid's active/concurrent limits and its independent warm-cache assertion. Record the installed baseline and Windows pending items without changing release state. [Acceptance matrix](UI_ACCEPTANCE_TEST_MATRIX.md)

## Local workspace preview

The first implementation increment uses GMT's own slate-blue palette, labeled analytical rail, condensed chart controls and an instrument-aware chart dock. Workspace links open the existing scanner, alerts and Advanced Chart Grid. The drawing rail uses the existing tool catalogue and anchors each flyout to its category while keeping it inside the window.

The existing indicator controls retain independent oscillator panes, resize, collapse, hide and removal. The price-scale alert action carries the active chart's canonical instrument, interval and quote-precision price to the existing local alert dialog. The display-zone preference is stored independently of instrument metadata. Intraday labels use the selected zone, higher-period candles keep their session dates, and candle and drawing timestamps stay unchanged. The reference recording established opening the alert and zone dialogs. Delivery and reference-zone persistence were unverified.

Use a disposable profile for the development preview. Keep native Windows x64 visual validation under WIN-CHARTGRID and WIN-ELECTRON44. Preserve the existing macOS fullscreen and focus limitations and all current source assertions. The ordinary source and UI checks still apply. Run the focused workspace check with `node scripts/workspace-redesign-ui.mjs` after a development build.

### Neutral workspace refinement

The native title area stays available for dragging and window controls. Native Charts fullscreen uses the 46 px chart bar as the top application row. At single-chart desktop widths, compact per-chart actions sit beside the legend; multi-chart panes retain their regular per-pane row. The 46 px drawing rail and 45 px icon-only analysis rail keep their keyboard names and existing actions. The dock can be expanded, resized, or collapsed from Charts. The bottom range and scale bar is 32 px.

The neutral palette reduces grid contrast and highlights active controls with amber. The default volume pane is 52 px; explicitly saved heights, chart colors and study colors keep their existing values. Chart settings, watchlist persistence, drawing anchor prices, and alert conditions use their existing storage. Save Workspace flushes the same serialized queue as autosave. Provider status and chart attribution remain available in the status bar.

The source version and update policy are unchanged. Native Windows acceptance under WIN-CHARTGRID and WIN-ELECTRON44 and the known intermittent local macOS fullscreen and focus limitations remain open.

### Final workspace polish

The wide primary toolbar uses a chevron for the full timeframe menu beside the selected shortcut. Narrow toolbars continue to show the interval in the full menu. Multi-chart panes retain their contextual controls; the primary toolbar continues to edit the active pane at compact widths. The legend omits repeated labels when the pane header can show them. Axis type uses the system font and scale width can grow beyond its lower minimum to fit the formatted values. The chart canvas, price precision, stored appearance settings, and licensed attribution continue to use their existing paths.
