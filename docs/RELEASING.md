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
