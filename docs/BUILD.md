# GLOBAL MARKET TERMINAL — Cross-Platform Build Guide

GLOBAL MARKET TERMINAL is built on a unified cross-platform architecture supporting macOS Apple Silicon (ARM64) and Windows (x64).

---

## 1. Prerequisites

### Common Requirements
- **Node.js:** Node.js v20.x or v22.x (LTS recommended)
- **Python:** Python 3.11.x 64-bit
- **Git:** Git 2.30+

### macOS Prerequisites
- Apple Silicon Mac (M1/M2/M3/M4) running macOS Monterey or later.
- Xcode Command Line Tools: `xcode-select --install`

### Windows Prerequisites
- Windows 10 or 11 64-bit (x64)
- PowerShell 7+ (`pwsh`) or Windows PowerShell 5.1
- Visual C++ Redistributable 2015–2022 x64 installed

---

## 2. Environment Setup

```bash
# Install Node dependencies
npm ci

# Set up Python virtual environment
python3 -m venv backend/.venv
# macOS:
source backend/.venv/bin/activate
# Windows PowerShell:
# .\backend\.venv\Scripts\Activate.ps1

pip install -r backend/requirements.txt
node scripts/setup.mjs
```

---

## 3. macOS Apple Silicon (ARM64) Packaging

1. Build frontend and native Objective-C++ notification bridge:
   ```bash
   npm run build
   ```
2. Package native frozen backend and ARM64 DMG/ZIP:
   ```bash
   npm run package:public:mac
   ```
3. Signing defaults to ad-hoc. Gatekeeper on macOS requires right-click -> Open on first launch for unnotarized builds.

---

## 4. Windows x64 Portable Packaging

On a native Windows 10/11 x64 machine:
1. Freeze backend into standalone AMD64 executable:
   ```powershell
   pwsh scripts/build-windows-backend.ps1
   ```
2. Package Windows portable application directory:
   ```powershell
   pwsh scripts/package-personal-win.ps1
   ```
3. The portable application is launched via `GLOBAL-MARKET-TERMINAL-Portable.cmd` which stores all local settings inside `GMT-Portable-Data` for complete host system isolation.

---

## 5. Third-Party Data Compliance

Public source and binary packaging omit official NSE CSV snapshots (`EQUITY_L.csv`, `SME_EQUITY_L.csv`) and user profiles. The application retrieves metadata directly from official exchange endpoints at runtime or allows users to import official files in Settings. Historical market data is held strictly in bounded memory.
