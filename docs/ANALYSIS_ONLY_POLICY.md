# GMT analysis-only product policy

GMT is a local chart and market analysis application. The allowed online market data routes are Hyperliquid public data for cryptocurrency and Yahoo Finance for non-crypto instruments. Existing explicit archive imports, directory metadata, local profiles and exports retain their established workflows. Public order book and trade records may support chart analysis, subject to provenance, completeness, terms, request budgets and measured performance.

## Product rules

- Prohibit Buy or Sell order controls, Trading Panel, real or paper trading, broker or exchange-account connections, wallet integration, order execution and trading API keys.
- Prohibit mandatory login, payment or subscription workflows, and additional market data providers. Analysis, local workspaces, watchlists, drawings, scans, alerts and exports must work within their existing supported offline or online states.
- Use verified feeds and deterministic, separately labeled estimates. Keep missing, partial, stale, delayed, offline and unsupported states visible. Never synthesize order flow, liquidity, trades, participant intent, historical book coverage, options data or liquidations to fill gaps.
- Describe provider trade-side fields only as market-observation data. Use neutral analytical labels and no actionable order affordances. Position, journal, P&L simulator and account surfaces from the reference remain outside the product objective.
- Preserve 69 indicators, 86 drawing tools, 59 screener conditions, the Advanced Chart Grid, and all existing profile data and exports. Own migrations, defaults, validations and rollback. Preserve existing request budgets, canonical identities and safe handling of provider records.
- Use original GMT code and design assets from compatible licenses. Preserve dependency notices. Keep competitor imagery, captures, user identities and raw market data out of tracked Git and distributable assets.
- Retain WIN-CHARTGRID and WIN-ELECTRON44 and the known intermittent Electron/macOS native fullscreen and focus limitation. Release promotion includes applicable native validation and distinct installation approval.

## Feature review checklist

For each proposal, record the analytical user task, provider and verified payload, timestamp and units, minimum required coverage, unavailable states, data permissions, cache and retention, validation evidence, existing-feature regression checks, and migration/rollback behavior. A feature lacking any necessary provider capability remains deferred. Review against the [provider matrix](PROVIDER_CAPABILITY_MATRIX.md) and executable [acceptance criteria](UI_ACCEPTANCE_TEST_MATRIX.md).
