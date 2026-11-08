# GLOBAL MARKET TERMINAL

Free and open-source desktop market chart analysis project for supported financial markets.

**Architecture:** Electron + React + TypeScript / Python + FastAPI  
**Chart Engine:** TradingView Lightweight Charts™  
**Version:** 1.1.0-rc.3 (API Contract 1.0.0)

---

## 1. Project Overview

**GLOBAL MARKET TERMINAL (GMT)** is a high-performance cross-platform desktop application designed for technical market analysis, chart visualization, multi-pane layouts, and offline-capable analytics. The application operates as a standalone desktop environment where a React frontend communicates over high-speed local IPC and HTTP with an embedded FastAPI analytical engine.

All market quotes and analytical calculations run locally or via direct public read-only market APIs. Historical candle data resides strictly in bounded in-memory cache; no persistent OHLCV database, external tracking, or broker execution connectivity is included.

---

## 2. Features

- **Advanced Charting:** Candlestick charts powered by TradingView Lightweight Charts™, supporting Linear, Logarithmic, and Automatic price-scale modes, vertical price-scale mouse wheel zoom, and timeframe synchronization.
- **Multi-Chart Layouts:** Flexible 1, 2, 4, 6, and 8-pane chart workspaces with synchronized crosshair cursor and timeframe controls.
- **Technical Indicators:** Over 69 analytical indicators (Moving Averages, RSI, MACD, Bollinger Bands, ATR, SuperTrend, AlphaTrend, HalfTrend, Volume Profile, Stochastic, etc.) with up to 20 concurrent studies per chart.
- **Drawing Tools:** Over 86 interactive geometric and technical drawing tools with automatic return to cursor on completion, editable anchors, and persistent styling.
- **Stock Watchlists:** Multi-list watchlist management with color flag tagging, fast keyboard navigation, dynamic quote streaming, stable selection, and drag/sort capabilities.
- **Stock Screener:** Integrated multi-metric screener supporting 59 technical filter conditions.
- **Historical Replay:** Bar-by-bar historical replay simulation with configurable playback speeds.
- **Price Alerts:** In-session visual and native system desktop notifications for configurable price levels and technical triggers.
- **Data Export:** Validated watchlist and candle data export to CSV and formatted Microsoft Excel (.xlsx) formats.
- **Theme Support:** Polished Dark and Light themes with high-contrast UI elements, custom chart color schemes, and seamless switching.

---

## 3. Supported Platforms

| Platform | Target Architecture | Verified Environment | Status |
| :--- | :--- | :--- | :--- |
| **macOS** | Apple Silicon (`arm64`) | macOS 14 / macOS 15 on Apple M2 | Primary Supported Target |
| **Windows** | x64 (`AMD64`) | Windows 10 64-bit (Version 22H2) | Primary Supported Target |
| **Windows 11** | x64 (`AMD64`) | Windows 11 64-bit | Compatible (Portable mode) |

*Note: Intel x86_64 macOS builds are not officially supported. Standalone application builds are ad-hoc signed for local and portable execution; system security settings (macOS Gatekeeper, Windows SmartScreen) may require explicit authorization.*

---

## 4. Development Requirements

### Common Requirements
- **Git:** Git 2.30+
- **Node.js:** Node.js v20.x or v22.x (LTS recommended)
- **Python:** Python 3.11.x (native 64-bit)
- **Package Managers:** npm 10+ and pip

### macOS Build Machine
- Apple Silicon Mac (M1/M2/M3/M4)
- Xcode Command Line Tools (`xcode-select --install`)

### Windows Build Machine
- Windows 10 or 11 64-bit
- PowerShell 7+ (`pwsh`) or Windows PowerShell 5.1
- Visual C++ Redistributable 2015–2022 x64

---

## 5. Clone and Setup

```bash
# Clone the unified repository
git clone https://github.com/nirdesh-balar/GLOBAL-MARKET-TERMINAL.git
cd GLOBAL-MARKET-TERMINAL

# Install Node.js dependencies
npm ci

# Set up Python virtual environment
python3 -m venv backend/.venv
# On macOS:
source backend/.venv/bin/activate
# On Windows (PowerShell):
# .\backend\.venv\Scripts\Activate.ps1

# Install Python requirements
pip install -r backend/requirements.txt

# Run automated project setup
node scripts/setup.mjs
```

---

## 6. Run in Development

Start both the backend FastAPI service and the Electron/Vite frontend development server concurrently:

```bash
npm run dev
```

The desktop application window will open automatically with hot-module replacement (HMR) enabled for the frontend and auto-reloading for the backend.

---

## 7. Testing

The repository contains an exhaustive suite of unit, integration, and platform regression tests:

```bash
# Run core test suite
npm run test

# Run backend Python tests (analytical math, indicators, contracts)
backend/.venv/bin/pytest backend/tests

# Run cross-platform configuration and packaging assertion tests
npm run test:platform
npm run test:package:config

# Run specific functional regressions
node scripts/watchlist-f31-unit-tests.mjs
node scripts/test-f32-light-theme-status.mjs
```

---

## 8. Build on macOS

To compile the native notification helper, bundle the frontend, freeze the Python analytical engine with PyInstaller, and package the standalone macOS Apple Silicon DMG:

```bash
# Build desktop assets
npm run build

# Package standalone macOS ARM64 candidate
npm run package:public:mac
```

Output artifacts (`GLOBAL-MARKET-TERMINAL-mac-arm64.dmg` and updater zip) will be generated in the specified output directory.

---

## 9. Build on Windows

On a native Windows 10/11 x64 machine, run the verified build scripts from PowerShell:

```powershell
# Build the frozen backend executable using PyInstaller
pwsh scripts/build-windows-backend.ps1

# Package the Windows x64 portable application
pwsh scripts/package-personal-win.ps1
```

The portable release will be created with `GLOBAL-MARKET-TERMINAL-Portable.cmd` configured for isolated user data in `GMT-Portable-Data`.

---

## 10. Project Directory Structure

```text
GLOBAL-MARKET-TERMINAL/
├── backend/                  # FastAPI backend analytical service
│   ├── app/                  # Application core, routers, indicators, models
│   ├── tests/                # Analytical math and API unit tests
│   ├── launcher.py           # PyInstaller entry point
│   ├── requirements.txt      # Pinned Python dependencies
│   └── windows-backend.spec  # PyInstaller specification for Windows AMD64
├── desktop/                  # Electron and React frontend application
│   ├── assets/               # Application icons (.icns, .ico)
│   ├── electron/             # Electron main process, IPC handlers, preload
│   ├── native/               # Native Objective-C++ notification helper (macOS)
│   └── src/                  # React 19 UI, components, charts, state hooks
├── build/                    # Platform packaging configurations (macOS & Windows)
├── docs/                     # Project architecture, build, and compliance guides
├── scripts/                  # Cross-platform build, packaging, and test scripts
├── THIRD_PARTY_NOTICES/      # Comprehensive license inventory for dependencies
├── LICENSE                   # Project MIT License
├── NOTICE                    # Upstream attribution notices
└── package.json              # Node.js project manifest and scripts
```

---

## 11. Data Provider Limitations

- **Yahoo Finance:** Historical daily/weekly and delayed intraday quotes are retrieved via `yfinance` solely for personal non-commercial analytical use. Direct exchange-grade real-time feeds are neither provided nor guaranteed.
- **Hyperliquid:** Crypto spot and perpetual market data are accessed via public read-only REST and WebSocket APIs.
- **NSE Reference Data:** Official instrument directory files (`EQUITY_L.csv`, `SME_EQUITY_L.csv`) are fetched at runtime from official archives or supplied by the user via Settings. No proprietary market data snapshots are redistributed with the repository source.

---

## 12. Open-Source License

This project's original source code is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for complete terms.

Third-party dependencies retain their respective licenses (TradingView Lightweight Charts™ is licensed under Apache-2.0; Electron is licensed under MIT). Detailed dependency licenses are documented in [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).

---

## 13. Contributing

Contributions, bug reports, and suggestions are welcome!

1. Fork the repository and create a descriptive feature branch (`git checkout -b feature/improvement`).
2. Verify all TypeScript types and regression tests pass (`npm run build && npm run test`).
3. Commit your changes with clear semantic messages (`git commit -m "feat(chart): add indicator parameter"`).
4. Push to your branch and submit a Pull Request.

Please review [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before submitting.

---

## 14. Disclaimer

GLOBAL MARKET TERMINAL is personal analytical and charting software. It does not provide financial, investment, or trading advice. No trading execution or brokerage connectivity is included. Market data may be delayed, incomplete, or unavailable depending on public provider endpoints. Use entirely at your own discretion.
