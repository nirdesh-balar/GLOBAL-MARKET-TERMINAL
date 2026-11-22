# Working on GLOBAL MARKET TERMINAL

The official shared repository is `nirdesh-balar/GLOBAL-MARKET-TERMINAL`. Start with [the project map](docs/CODEX_PROJECT_MAP.md), then follow the affected renderer, Electron, or backend paths. Use [the development log](docs/CODEX_CHANGELOG.md) to locate prior decisions and baseline results.

## Changes and validation

- Develop and verify on native macOS arm64 first. Keep Windows x64 on the same source and isolate platform differences in existing adapters, native integrations, and packaging configurations.
- Preserve chart layouts and synchronization, indicators, drawings, replay, watchlists, screeners, alerts, themes, window controls, process lifecycle, and persisted profiles. Reuse existing models and boundaries, and test changed behavior through its normal entry points with isolated fixtures and temporary profiles.
- Keep market data read-only. Route crypto through official Hyperliquid spot/perpetual identities and ordinary non-crypto history through Yahoo Finance. Keep NSE directory metadata and explicit archive imports on their existing paths. Preserve provider identity, request budgets and in-memory candle storage. Provider policy, execution capabilities, application identity and update-channel changes require an explicit requirement.
- Use the Node and Python lockfiles. Start shared checks with `npm run build`, `npm test`, `npm run test:platform`, and `npm run test:package:config`. Add targeted numerical, UI or backend tests as needed. Use `npm run test:macos -- --math` and `npm run test:macos -- --ui` on Apple Silicon, and `npm run test:release` for release and updater unit checks. See [testing](docs/TESTING.md) for native evidence requirements.
- Record the tested SHA, actual counts, fixture scope, and pre-existing failures. Current macOS fixture tests and Windows configuration assertions support shared development. Record open Windows work and the required native commands in [Windows pending](docs/WINDOWS_PENDING.md).

## Source and releases

- Check the working tree, branch, official remote and remote `main` before work. Preserve local changes and history. Use a task branch, review the full diff, and keep credentials, profiles, market snapshots, test output and binaries out of source. Push to the official repository and integrate through the permitted pull request and CI workflow.
- Keep the product SemVer aligned across `package.json`, `package-lock.json`, `desktop/src/brand.ts` and backend `/health`. Treat API version, Mac bundle versions and release channel as separate compatibility surfaces. Use a unique candidate output path with a source SHA and checksums.
- Use the [Mac release status](docs/MAC_RELEASE_STATUS.md) and [release gates](docs/RELEASING.md) before packaging, promotion or installation. Keep current approved and rollback artifacts and protect profiles. Run cleanup in preview mode first and obtain itemized approval before a move or removal. Source synchronization and binary publication have separate approvals.
- For each accepted change, update the applicable records and report branch, SHA, remote and `main` status, tests, Mac release status and Windows validation status.
