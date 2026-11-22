# macOS release status

## Initial audit of `1.1.0-rc.6`

| Item | Evidence |
| --- | --- |
| Audited source | Official `main` at `5a3c0713e08e9fbb739272f2363acfd45465b377`. Native Apple Silicon build with the lockfile-matched Node 22.19.0 / npm 10.9.3 and Python 3.11.17. |
| Candidate identity | Fresh, isolated local DMG/ZIP and unpacked arm64 app/backend. Bundle ID `local.globalmarket.terminal`, `CFBundleShortVersionString` `1.1.0`, `CFBundleVersion` `1.1.0.1`, embedded app SemVer `1.1.0-rc.6`, and embedded audited source SHA. DMG CRC, read-only mount, Applications link, updater SHA-512 entries, and strict ad-hoc signature verification passed. |
| Launch and runtime | The older local rc.6 archive launched twice with an isolated profile and preserved the changed theme. Its embedded source revision is null. The fresh candidate's frozen backend returned real Yahoo Finance RELIANCE candles, Hyperliquid UBTC/USDC spot and BTC perpetual candles, and a live BTC WebSocket quote. It exited through the private parent-pipe protocol with code 0. See [development log](CODEX_CHANGELOG.md) for the source and fixture baseline. |
| Installation | The audit found no matching bundle ID in the standard system or user Applications folders. The existing profile, earlier archives and local rollback options were retained. |
| Promotion gates | Candidate is ad-hoc signed and `blocked-unsigned`. Developer ID, notarization, downloaded Gatekeeper acceptance, native notification delivery, official signed update A-to-B and approval to publish remain pending. The public Mac and personal Windows packaging paths embed the ignored NSE CSV snapshots. Reconcile that behavior with the redistribution guidance in `BUILD.md` before publication. |

The tested build produced these SHA-256 fingerprints.

- DMG `79b4b0d941eb2ab80025fce08687670e1f7ec7927a6d284f3aa81f435e46700b`
- ZIP `282694ed8aa2299f99db35d7081f4447260a288f8fc6e2fdefca035a349d9d79`

## Version policy and existing mismatches

Use `package.json` as the application SemVer authority. Keep the root lockfile version, `desktop/src/brand.ts` and `/health` in sync. `scripts/version-consistency-test.mjs` checks these fields and representative artifact names. The API contract is independently `1.0.0`. Preserve the package identity, stable feed, native build-version rules and updater policy until a release explicitly changes them.

README displays `1.1.0-rc.3`, CHANGELOG ends at the unpublished `1.0.0` candidate, and the default public Mac output and workflow retain a `v1.0.0` directory label. `TRANSFER_AND_BUILD_GUIDE.md` describes a historical Windows bundle and `1.0.0` installer. The draft-release gate has a version/tag allowlist ending at `rc.3` and a `v1.0.0` draft title. `release-ui.mjs` expects `rc.1`. Reconcile the applicable gate, output paths and version assertions before offering the next approved release. A stable channel marker is used for package identity and unsigned candidates remain blocked by update readiness.

## Build, installation and retention

1. Check out the exact approved clean revision with the official origin. Use a fresh, versioned `GMT_MAC_OUTPUT` directory, enough free space and the existing locked toolchain. Run `npm ci`, prepare the Python 3.11 venv from `backend/requirements-lock.txt`, prepare allowable test directory resources, then run `npm run package:public:mac`. The wrapper builds assets, freezes the backend, and emits the DMG, ZIP, metadata and blockmaps with publication disabled.
2. Verify the bundle identity, native architectures, signature and checksums. Mount the DMG read-only and inspect its app and Applications link. Test the copied candidate in a private slot with a new temporary profile. Verify startup, shutdown, charts, settings/restart, and any changed workflows. Use [the release procedure](RELEASING.md) for trusted distribution, updater and separate publication approval.
3. For a requested installation, quit the current app, identify the intended installation by bundle ID, verify that the profile and exports are protected, and archive the last working bundle and its version/checksum outside Applications. Replace the intended active application after verification and required approval. Reopen and confirm bundle version, profile continuity and one active installed copy. Keep rollback available until the new installation is confirmed healthy.
4. For cleanup, start with `node scripts/project-cleanup.mjs`. It previews only two regenerable PyInstaller build/cache paths. An exact digest and explicit itemized approval are required for recoverable quarantine. Build archives need their own read-only inventory and approval. Identify actual app IDs and versions, hash artifacts, confirm recoverability and open-file state, and protect verified current/rollback copies, Git history, metadata, profiles and exports. Report every retained or moved item and the measured space change.

The initial cleanup preview identified `backend/build-public` and `.runtime/pyinstaller-public` as regenerable, totaling 119,002,604 logical bytes. Cleanup stopped at the preview with zero bytes reclaimed.
