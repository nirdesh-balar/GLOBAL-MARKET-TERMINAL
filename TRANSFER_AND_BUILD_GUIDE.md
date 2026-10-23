# GLOBAL MARKET TERMINAL — Physical Windows x64 Build Guide

This guide details the procedure for building the private, personal Windows x64 installer on a native Windows 10/11 x64 machine.

---

## 1. Safety and Machine Protection

To safeguard the Windows computer:
1. **Isolated Account:** Use a standard, non-administrator Windows user account if possible.
2. **Dedicated Workspace:** Create a clean, isolated project folder (e.g. `C:\GMT\GMT-Windows-Personal` or `C:\Users\<user>\Projects\GMT-Windows-Personal`).
3. **No Global Mutations:** All dependencies (Node modules and Python virtual environment) are installed locally inside the project folder. No global packages or registry keys outside normal standard software installations are modified.
4. **No Remote Uploads:** `git remote -v` is empty and publishing is disabled (`publish=never`).

---

## 2. Windows PC Prerequisites

Before starting, verify that the PC has:
- **Operating System:** Windows 10 or Windows 11 64-bit (x64)
- **Node.js:** Node.js v20.x or v22.x x64 (download from https://nodejs.org/)
- **Python:** Python 3.11.x x64 (download from https://www.python.org/downloads/windows/ — check "Add Python to PATH")
- **Git:** Git for Windows (download from https://git-scm.com/)

---

## 3. Transfer and Clone via Bundle

1. Copy `gmt-windows-personal.bundle` and `offline-resources/` via USB drive or local network to the Windows machine (e.g. into `C:\GMT\`).
2. Verify the SHA-256 checksum in PowerShell:
   ```powershell
   Get-FileHash -Path "gmt-windows-personal.bundle" -Algorithm SHA256
   ```
   **Expected Checksum:** `c7277f87e9cea3a6b5f9390749f78caaddeb7226697751e07b11a67a2bb7f719`

3. Clone the bundle into the isolated directory:
   ```powershell
   git clone gmt-windows-personal.bundle GMT-Windows-Personal
   cd GMT-Windows-Personal
   git remote remove origin
   git remote -v
   git checkout windows-personal
   ```

4. Place official NSE directory resources:
   ```powershell
   # If offline-resources folder was transferred:
   Copy-Item "..\offline-resources\*.csv" "backend\resources\"
   # Or download directly from official NSE servers:
   node scripts/download-test-directory.mjs
   ```

---

## 4. Run Prerequisites Check

Execute the automated checker in PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\check-windows-prereqs.ps1
```
All items (OS x64, Node >= 20, Python 3.11, NSE resources, packaging assets) must report `[PASS]`.

---

## 5. Install Dependencies and Run Tests

1. Install Node dependencies:
   ```powershell
   npm ci
   ```

2. Create and populate local Python virtual environment:
   ```powershell
   python -m venv backend\.venv
   backend\.venv\Scripts\python.exe -m pip install --upgrade pip
   backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
   ```

3. Run test suites:
   ```powershell
   npm test
   npm run test:platform
   npm run test:package:config
   ```

---

## 6. Compile and Package

Run the master packaging entrypoint:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-personal-win.ps1
```

The script automatically executes:
- Frontend & Electron compilation (`npm run build`)
- Standalone Python backend freezing via PyInstaller (`imt-backend.exe`)
- Verification that `imt-backend.exe` is a valid 64-bit PE executable (`IMAGE_FILE_MACHINE_AMD64 = 0x8664`)
- Electron NSIS packaging (`electron-builder --win --x64`)
- Checksum computation (`.sha256`)
- Generation of `windows-packaging-report.json`

The final installer will be saved to:
`release-win-candidate\GLOBAL-MARKET-TERMINAL-Setup-1.0.0-win-x64.exe`

---

## 7. Interactive Desktop Testing

1. Run the installer or test the application:
   ```powershell
   .\release-win-candidate\GLOBAL-MARKET-TERMINAL-Setup-1.0.0-win-x64.exe
   ```
2. Confirm the UI renders with dark theme, TradingView-style interface.
3. Verify RELIANCE and TCS charts render candles.
4. Verify indicators (EMA, RSI, MACD), drawings, and 1/2/4 layouts.
5. Exit application and confirm backend process shuts down cleanly.
