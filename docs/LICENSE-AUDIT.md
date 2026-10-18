# License and data review — proposed, publication pending

MIT is proposed for original GLOBAL MARKET TERMINAL code and artwork, subject to the owner's confirmation of rights and approval of the exact source manifest. Third-party components retain their own licenses. The project license does not grant market-data redistribution or trademark rights.

Production npm components are inventoried in THIRD_PARTY_NOTICES/npm-inventory.json: React/React DOM, Lucide, electron-updater and its runtime dependencies use permissive licenses; Lightweight Charts uses Apache-2.0. Its logo/attribution, Settings notice and TradingView links remain. Copied license/NOTICE texts accompany the source; Electron includes its own Chromium third-party notices in the native bundle.

Pinned Python components are inventoried separately. They include Apache/MIT/BSD/PSF-style licenses and certifi's MPL-2.0 notice. PyInstaller has a GPL license with a bootloader distribution exception; this is not a claim that all third-party code is MIT. Preserve unmodified notices and required upstream source links for the exact versions. No proprietary/broker SDK is included by the application.

Some upstream wheels/npm tarballs omit full license texts. Retrieved upstream copies are supplemental, with provenance in the private review evidence; an exact-version copyright/notice review is required before public binary approval. The initial development DMG was produced before this notice review finished. It must not be published as a final licensed distribution.

Public source/export and public packaging omit NSE directory CSV snapshots, fetched history, user databases, logs and investigation evidence. The app retrieves official metadata directly or uses user-selected permitted files. Yahoo/yfinance use remains subject to Yahoo's data terms; the Python library's code license does not authorize redistribution of Yahoo data. Hyperliquid access remains official public read-only REST/WebSocket. No downloaded provider data is relicensed by this repository.

Primary references: [MIT](https://opensource.org/license/MIT), [Lightweight Charts](https://github.com/tradingview/lightweight-charts), [yfinance terms notice](https://github.com/ranaroussi/yfinance), [PyInstaller license](https://pyinstaller.org/en/stable/license.html). This inventory and the owner's approvals are release gates, not a guarantee of third-party rights beyond their published terms.
