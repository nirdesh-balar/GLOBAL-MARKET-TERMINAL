# macOS release gates

The only destination is nirdesh-balar/GLOBAL-MARKET-TERMINAL. Verify the authenticated owner and exact approved revision before every remote write. Source pushes, binary uploads and stable publication each require their applicable explicit approval.

1. Review the exact source manifest, secret/personal-information scan, reachable public history, MIT scope and unchanged third-party obligations. Preserve private checkpoints.
2. Approve the exact source commit for a normal fast-forward push. CI uses read-only tokens and persist-credentials:false; PRs receive no release/signing credentials.
3. Build a separate macOS arm64 candidate. Validate DMG installation, app/backend identity, hashes, real charts, notifications, restart and profile preservation.
4. Verify trusted Developer ID signing, notarization, downloaded Gatekeeper acceptance and native signed A-to-B updates. Existing v0.7.0 users require one manual bootstrap installation. These gates remain unverified for the ad-hoc development candidate.
5. Independently approve protected GitHub release-environment settings and the exact binary asset list. Existing manual draft controls require all native gates and final approval; no branch push automatically publishes.
6. After separate approval, inspect the exact draft assets before stable publication. Verify downloaded bytes before adding installer links. No official v1.0.0 stable release is currently published.

Required assets: GLOBAL-MARKET-TERMINAL-mac-arm64.dmg, the actual generated arm64 updater ZIP and latest-mac.yml. Include generated blockmaps, checksums, notices and release notes as approved. Never handwrite update hashes or treat ad-hoc signing as trusted signing.

The updater validates the fixed official feed and native signing, rejects prereleases/downgrades and installs only on explicit user restart. Candidate metadata keeps unsigned builds blocked. Historical Git commits remain intact after ordinary platform-source deletions; no history rewriting is needed.

## Local Mac development candidates

Work on native Apple Silicon in the permanent checkout. Fetch `origin` and verify the clean `main` HEAD matches the exact approved `origin/main` SHA. Activate the project-local Node 22.19.0 path and use `backend/.venv` with the locked Python dependencies. Prepare the official test directory fixtures with `node scripts/download-test-directory.mjs`. Keep these and all release evidence out of Git.

Run the verification pipeline below in a fresh shell after setting `GMT_APPROVED_SHA` to the reviewed full hash. Set `TMPDIR` to a new disposable directory under the Mac temporary location. Use the default ad-hoc development signing mode for this workflow.

```sh
set -eu
test "$(git remote get-url origin)" = https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL.git
test "$(git symbolic-ref --short HEAD)" = main
test "$(git rev-parse HEAD)" = "${GMT_APPROVED_SHA:?Set the approved source SHA}"
test "$(git rev-parse origin/main)" = "$GMT_APPROVED_SHA"
test -z "$(git status --porcelain)"
test "$(node -p process.arch)" = arm64
test "$(node -v)" = v22.19.0
test ! -e /tmp/gmt-test-user-copy/terminal.sqlite3
npm ci
if [ ! -x node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ]; then
  npm exec --no -- install-electron
fi
npm run build
npm test
IMT_OFFLINE=1 backend/.venv/bin/python -m pytest backend/tests -q -rs
npm run test:platform
npm run test:package:config
npm run test:release
node scripts/version-consistency-test.mjs
npm run test:macos -- --math
caffeinate -di npm run test:macos -- --ui
version=$(node -p "require('./package.json').version")
export GMT_MAC_OUTPUT="$PWD/.runtime/releases/${version}-${GMT_APPROVED_SHA}-$(date -u +%Y%m%dT%H%M%SZ)"
GMT_SIGNED_RELEASE=0 npm run package:public:mac
```

Verify the app and frozen backend are ARM64, extract the embedded version and source SHA from `app.asar`, and use `codesign --verify --deep --strict` and `hdiutil verify`. Inspect the DMG read-only, check the updater metadata against the generated ZIP and blockmaps, and record SHA-256 checksums. Use the candidate executable and the packaged-launch profile guard for isolated checks of chart rendering, both data providers, stream updates, watchlists, indicators, restart and backend shutdown. Review historical acceptance scripts for fixed version expectations before reuse. Record which checks ran and each result.

Preview installation by listing the exact candidate, its checksum and version, the target `/Applications/GLOBAL MARKET TERMINAL.app`, the current bundle identity and the backup location. Protect the production, development and legacy profiles. After explicit approval, quit the exact running app, take a consistent profile backup and a verified bundle backup if applicable, and stage the verified bundle at the target volume. Preserve the existing bundle until the approved swap. Verify the installed copy, isolated launch, and profile continuity. Restore the last working bundle if verification fails. Record the installed version and source SHA with the rollback location.

Preview regenerable build cleanup with `node scripts/project-cleanup.mjs`. For app copies and archives, separately inventory paths, exact sizes, versions, hashes, source SHAs, backups and open-file status. Keep one verified current set and last-known-good rollback where available. Review the exact plan before any removal or quarantine. Keep Git history, profiles, exports and diagnostic evidence available.
