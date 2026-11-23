# macOS release status

## 1.1.0-rc.8 Phase 1 candidate preparation

Phase 1 source is integrated at `3f044d65fcc3dc78177aeddcadc65e436fa4c673`. The [PR source verification](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45131060334) passed all 32 macOS UI scripts, including native fullscreen, and measured the normal eight-chart warm restore at 1,719 ms with zero additional provider requests. The [post-merge run](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45135294940) tracks integrated main. The installed ARM64 app is 1.1.0-rc.7 at `f53b57f84b7ff4cac784f54856a47292cc4a8a9c`.

The proposed 1.1.0-rc.8 revision uses Electron 44.11.5, API 1.0.0, bundle ID `local.globalmarket.terminal`, native short version `1.1.0`, and build `1.1.0.3`. Source integration approval is required before packaging. Build from the approved, verified official main with the existing private candidate workflow and a fresh `GMT_MAC_OUTPUT`. Record the exact version, embedded source SHA, app and frozen-backend ARM64 identities, signature, DMG, ZIP, updater metadata, blockmaps and checksums. [Release procedure](RELEASING.md)

### Native fullscreen limitation

On local macOS 27.2.1 arm64, Electron 44.11.5 intermittently started a native fullscreen transition and returned to normal bounds without an `enter-full-screen` event. The same cancellation reproduced with direct `BrowserWindow.setFullScreen(true)` in a minimal Electron window without GMT code, renderer or IPC. In GMT, the renderer request reached main and the app reset the pending state; a separate run completed enter, exit and the Escape sequence. The underlying native cause remains open. Preserve the 15-second UI timeout and all fullscreen assertions.

### Packaged acceptance and installation

1. Use disposable profiles to verify watchlists, indicators, drawings, scanners, alerts, restart persistence and owned backend exit. Verify real Yahoo Finance and Hyperliquid data with canonical instruments in Charts and Grid. Record Grid pagination, timeframe changes, maximize/restore, cache reuse and upstream deltas. Preserve the strict under-2,000 ms Charts limit and zero extra provider requests on warm restoration.
2. Run bounded native fullscreen enter, exit and Escape checks in normal Charts and Chart Grid on the maintainer's Mac. Record each transition, focus, chart restoration and renderer errors. If transitions remain intermittent, retain the candidate for preview and include the limitation in the installation decision.
3. Before requesting the swap at `/Applications/GLOBAL MARKET TERMINAL.app`, provide the candidate version, approved SHA, artifact and bundle verification, native acceptance results and rollback location. Retain the verified rc.7 artifacts and existing profile backups. During the approved installation window, take fresh consistent copies of the production, development and legacy profiles and record their verification. If rc.8 fails installation acceptance, restore the verified rc.7 bundle and restore the pre-install profile snapshot if required for continuity. Preserve both release sets, exports and all earlier evidence.

## 1.1.0-rc.7 security candidate

Electron 44.11.5 includes the upstream fix for [CVE-2026-115570](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9). The candidate keeps bundle ID `local.globalmarket.terminal` and native version `1.1.0`, with bundle build `1.1.0.2`. Its acceptance record must identify the exact integrated source, artifact checksums, packaged Electron and backend versions, disposable live-market and notification checks, and installed-profile continuity. Keep the acceptance record with the private candidate artifacts.

## Integrated CI foundation

PR #2 merged into `main` at `901540d084e995d12974dfe8ed1ed1244bca7fb2`. Its [hosted source run](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/actions/runs/45017424968) passed all 18 numerical and 31 UI fixture scripts. Focused native source tests also passed at the exact PR head. These results cover the updated version assertion and persisted Ichimoku settings across restart. A local release candidate requires fresh artifact and packaged acceptance evidence at the final integrated SHA.

## Initial audit of `1.1.0-rc.6`

| Item | Evidence |
| --- | --- |
| Audited source | Official `main` at `5a3c0713e08e9fbb739272f2363acfd45465b377`. Native Apple Silicon build with the lockfile-matched Node 22.19.0 / npm 10.9.3 and Python 3.11.17. |
| Candidate identity | Fresh, isolated local DMG/ZIP and unpacked arm64 app/backend. Bundle ID `local.globalmarket.terminal`, `CFBundleShortVersionString` `1.1.0`, `CFBundleVersion` `1.1.0.1`, embedded app SemVer `1.1.0-rc.6`, and embedded audited source SHA. DMG CRC, read-only mount, Applications link, updater SHA-512 entries, and strict ad-hoc signature verification passed. |
| Launch and runtime | The new candidate launched twice with an isolated profile and exited cleanly both times. Verified a live chart, EMA addition, watchlist visibility, the alert dialog, responsive navigation, blocked unsigned updates, and theme/EMA persistence after restart. Its frozen backend returned 14 Yahoo Finance RELIANCE daily candles, 8 Hyperliquid UBTC/USDC spot candles, 8 BTC perpetual candles, and a live BTC WebSocket quote. It exited through the parent-pipe protocol with code 0. The archived rc.6 ZIP also passed a scoped launch/restart smoke, with a null embedded source revision. |
| Installation | The audit found no matching bundle ID in the standard system or user Applications folders. The existing profile, earlier archives and local rollback options were retained. |
| Promotion gates | Candidate is ad-hoc signed and `blocked-unsigned`. Developer ID, notarization, downloaded Gatekeeper acceptance, native notification delivery, official signed update A-to-B and approval to publish remain pending. The public Mac and personal Windows packaging paths embed the ignored NSE CSV snapshots. Reconcile that behavior with the redistribution guidance in `BUILD.md` before publication. |

The tested build produced these SHA-256 fingerprints.

- DMG `79b4b0d941eb2ab80025fce08687670e1f7ec7927a6d284f3aa81f435e46700b`
- ZIP `282694ed8aa2299f99db35d7081f4447260a288f8fc6e2fdefca035a349d9d79`

## Version policy and existing mismatches

Use `package.json` as the application SemVer authority. Keep the root lockfile version, `desktop/src/brand.ts` and `/health` in sync. `scripts/version-consistency-test.mjs` checks these fields and representative artifact names. The API contract is independently `1.0.0`. Preserve the package identity, stable feed, native build-version rules and updater policy until a release explicitly changes them.

The default public Mac output and workflow retain a historical `v1.0.0` directory label. `TRANSFER_AND_BUILD_GUIDE.md` describes a historical Windows bundle and `1.0.0` installer. The draft-release gate has a version/tag allowlist ending at `rc.3` and a `v1.0.0` draft title. The locked Electron 44.11.5 toolchain requires Node 22.12 or newer. Use the verified Node 22.19.0. The stable marker identifies the package and unsigned candidates remain blocked by update readiness. Reconcile release metadata and the bundled NSE CSV redistribution policy before publication.

## Build, installation and retention

1. Check out the exact approved clean revision with the official origin. Use a fresh, versioned `GMT_MAC_OUTPUT` directory, enough free space and the existing locked toolchain. Run `npm ci`, prepare the Python 3.11 venv from `backend/requirements-lock.txt`, prepare allowable test directory resources, then run `npm run package:public:mac`. The wrapper builds assets, freezes the backend, and emits the DMG, ZIP, metadata and blockmaps with publication disabled.
2. Verify the bundle identity, native architectures, signature and checksums. Mount the DMG read-only and inspect its app and Applications link. Test the copied candidate in a private slot with a new temporary profile. Verify startup, shutdown, charts, settings/restart, and any changed workflows. Use [the release procedure](RELEASING.md) for trusted distribution, updater and separate publication approval.
3. For a requested installation, quit the current app, identify the intended installation by bundle ID, verify that the profile and exports are protected, and archive the last working bundle and its version/checksum outside Applications. Replace the intended active application after verification and required approval. Reopen and confirm bundle version, profile continuity and one active installed copy. Keep rollback available until the new installation is confirmed healthy.
4. For cleanup, start with `node scripts/project-cleanup.mjs`. It previews only two regenerable PyInstaller build/cache paths. An exact digest and explicit itemized approval are required for recoverable quarantine. Build archives need their own read-only inventory and approval. Identify actual app IDs and versions, hash artifacts, confirm recoverability and open-file state, and protect verified current/rollback copies, Git history, metadata, profiles and exports. Report every retained or moved item and the measured space change.

The initial cleanup preview identified `backend/build-public` and `.runtime/pyinstaller-public` as regenerable, totaling 119,002,604 logical bytes. Cleanup stopped at the preview with zero bytes reclaimed.
