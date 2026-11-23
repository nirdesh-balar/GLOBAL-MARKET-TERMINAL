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
