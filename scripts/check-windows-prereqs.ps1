# ==============================================================================
# GLOBAL MARKET TERMINAL — Windows Build Prerequisites Checker
# Validates build requirements without modifying any files or environment state.
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " GLOBAL MARKET TERMINAL — Windows Build Prerequisites Check" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$allPass = $true

# 1. OS & Architecture
$isWindows = $env:OS -like "*Windows*"
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
$isX64 = ($arch -eq [System.Runtime.InteropServices.Architecture]::X64)

if ($isWindows -and $isX64) {
    Write-Host "[PASS] Operating System: Windows x64 ($([System.Environment]::OSVersion.VersionString))" -ForegroundColor Green
} else {
    Write-Host "[FAIL] OS must be Windows 10/11 64-bit (x64). Detected: $env:OS / $arch" -ForegroundColor Red
    $allPass = $false
}

# 2. Node.js Version
$nodeVer = & node -v 2>$null
if ($nodeVer -match "^v(\d+)") {
    $major = [int]$matches[1]
    if ($major -ge 20) {
        Write-Host "[PASS] Node.js: $nodeVer (>= v20 required)" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Node.js $nodeVer is too old. Requires >= v20." -ForegroundColor Red
        $allPass = $false
    }
} else {
    Write-Host "[FAIL] Node.js is not found in PATH." -ForegroundColor Red
    $allPass = $false
}

# 3. Python 3.11 Version
$pythonCmd = "python"
if (Test-Path "backend/.venv/Scripts/python.exe") {
    $pythonCmd = Resolve-Path "backend/.venv/Scripts/python.exe"
    Write-Host "[INFO] Using virtual environment Python at: $pythonCmd" -ForegroundColor Gray
}

$pyVer = & $pythonCmd --version 2>$null
if ($pyVer -match "3\.11") {
    Write-Host "[PASS] Python: $pyVer (3.11.x target confirmed)" -ForegroundColor Green
} elseif ($pyVer -match "3\.") {
    Write-Host "[WARN] Python: $pyVer (Python 3.11.x strongly recommended for binary parity)" -ForegroundColor Yellow
} else {
    Write-Host "[FAIL] Python 3.11 is not found." -ForegroundColor Red
    $allPass = $false
}

# 4. Node Dependencies
if (Test-Path "node_modules") {
    Write-Host "[PASS] node_modules installed" -ForegroundColor Green
} else {
    Write-Host "[FAIL] node_modules missing. Run 'npm ci' first." -ForegroundColor Red
    $allPass = $false
}

# 5. Official Market Resources
$equity = Test-Path "backend/resources/EQUITY_L.csv"
$sme = Test-Path "backend/resources/SME_EQUITY_L.csv"
if ($equity -and $sme) {
    Write-Host "[PASS] Official NSE directory files present" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Missing NSE directory files in backend/resources/. Run 'node scripts/download-test-directory.mjs'." -ForegroundColor Red
    $allPass = $false
}

# 6. Windows Packaging Assets
$ico = Test-Path "desktop/assets/icon.ico"
$winConfig = Test-Path "build/personal-win.config.cjs"
$spec = Test-Path "backend/windows-backend.spec"

if ($ico -and $winConfig -and $spec) {
    Write-Host "[PASS] Windows packaging assets and configurations present" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Missing packaging assets: icon.ico ($ico), personal-win.config.cjs ($winConfig), windows-backend.spec ($spec)" -ForegroundColor Red
    $allPass = $false
}

# 7. Git Isolation
$remote = & git remote -v 2>$null
if (-not $remote) {
    Write-Host "[PASS] Git remote is empty (Isolated local build safe from publishing)" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Git remote is not empty: $remote" -ForegroundColor Red
    $allPass = $false
}

Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
if ($allPass) {
    Write-Host "All Windows prerequisites verified. Ready for packaging." -ForegroundColor Green
    exit 0
} else {
    Write-Host "Prerequisites check failed. Review errors above before packaging." -ForegroundColor Red
    exit 1
}
