# GLOBAL MARKET TERMINAL

A cross-platform desktop market analysis application built with Electron, React, TypeScript, FastAPI and Lightweight Charts.

## Download

The first public v1.0.0 release is being validated. **No public installer download is available yet.** Direct installer links will appear here only after the approved assets are published and their downloaded bytes are verified. Local development candidates are not a stable cross-platform release.

Targets: macOS Apple Silicon arm64 and Windows 11 x64. Windows 10 and Windows ARM64 are not supported without separate testing.

## Features

- Independent 1/2/4/6/8 chart layouts, nine timeframes, replay, LOG/AUTO/percentage scales and resizable study panes.
- 69 technical indicators, a maximum of 20 studies per chart, 86 drawing tools and 59 screener conditions.
- Yahoo Finance for non-crypto history; official public Hyperliquid REST/WebSocket for verified crypto spot and perpetual identities.
- Watchlists, validated CSV import/export, drawing JSON/templates, analytical alerts and local settings.
- Historical candles stay in bounded memory. There is no permanent OHLCV database or broker/trading connection.

Public analytical AlphaTrend and HalfTrend remain available. Unsupported Open Interest Profile, Option Chain and proprietary Dhan placeholders are hidden; exact legacy records are retained without replacement.

## Installation and updates

When an approved installer becomes available: on macOS open the DMG and drag GLOBAL MARKET TERMINAL into Applications; on Windows run the per-user Setup installer. End users do not need Python, Node.js or developer tools. Respect Gatekeeper, SmartScreen and organizational policy; do not disable system security.

Application Updates in Settings supports background stable checks, download progress and an explicit Restart to Update. Trusted native signing and version-to-version acceptance are required before this is enabled in a distributed build. Unsigned development candidates report updates as blocked. Existing v0.7.0 installations have no updater and require one manual bootstrap installation.

## Development

See [build instructions](docs/BUILD.md), [testing](docs/TESTING.md), [release gates](docs/RELEASING.md), [storage policy](docs/STORAGE.md), [data and third-party terms](docs/LICENSE-AUDIT.md) and [contribution instructions](CONTRIBUTING.md).

Use Node 22.19.0, native Python 3.11 on macOS and standard CPython 3.13.16 x64 on Windows (see [Windows runtime review](docs/WINDOWS-CI-RUNTIME.md)). Run `npm ci`, then `npm run setup` on macOS or `npm run setup:windows` on Windows. Build with `npm run build`. Native Windows builds must run on Windows.

Market data rights are separate from the application's proposed MIT license. The app fetches NSE directory metadata directly or lets users select permitted official files; provider directory CSV snapshots and historical candles are not part of the public source or public installer payload. Coverage, delays, rate limits and market availability vary. This application is for read-only personal analysis and does not place orders or guarantee live exchange quotes.

## Community

[Source](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL) · [Releases](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/releases) · [Bug reports](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/issues) · [Feature requests](https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL/issues/new?template=feature_request.yml) · [Contributions](CONTRIBUTING.md) · [Documentation](docs/BUILD.md)

TradingView Lightweight Charts™ is licensed under Apache 2.0. Its attribution and chart links remain visible. Third-party notices are in NOTICE and THIRD_PARTY_NOTICES. The proposed project MIT license and exact public source manifest require owner approval before publication.
