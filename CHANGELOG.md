# Changelog

## 1.1.0-rc.8 — release preparation

- Add a dedicated Chart Grid with paginated watchlist and screener handoffs, symbol and timeframe controls, responsive cards, SMA/EMA, native fullscreen, and a return path to Charts.
- Store only versioned Grid preferences and canonical identities in the local workspace. Use existing Yahoo Finance and Hyperliquid historical snapshots, bounded request ownership and existing caches.
- Recover malformed or unsupported Grid settings during atomic watchlist saves while archiving their original JSON. Wait for replacement drawing IDs before evaluating invalid-import persistence in the Stage 4 UI regression.
- Advance the native Mac build to 1.1.0.3 and retain Electron 44.11.5 and API contract 1.0.0. Local native fullscreen on macOS 27.2.1 remains intermittent.

## 1.1.0-rc.7 — security candidate

- Pin Electron to 44.11.5 on the existing Electron 44 release line. This includes the fix for [GHSA-jr5w-w6x2-84p9 / CVE-2026-115570](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9) involving compromised intermediate certificates.
- Synchronize the renderer, backend health response, manifests, and packaged acceptance guard with rc.7. Advance the macOS bundle build to 1.1.0.2.

## 1.0.0 — candidate, unpublished

- Retained the existing verified macOS application; development and packaging now target Apple Silicon arm64 only.
- Hid the three unsupported library placeholders while preserving all 69 working studies and retaining matching legacy records separately.
- Added signed stable-update controls with six-hour checks, progress and explicit restart; unsigned candidates remain blocked.
- Prepared macOS DMG/ZIP workflows for the sole official repository.
- Added public source/license/security review and scoped, dry-run-first storage maintenance.

Trusted Developer ID signing, notarization, Gatekeeper acceptance, native A-to-B updates and final publication approval are outstanding. There are no verified public installer links yet.

## 0.7.0 — previous personal Mac release

Preserved unchanged as the private verified baseline. Earlier source, releases, profiles and investigation evidence are not part of the public repository history.
