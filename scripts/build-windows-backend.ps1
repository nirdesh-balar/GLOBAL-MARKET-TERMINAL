# ==============================================================================
# GLOBAL MARKET TERMINAL — Windows Backend Frozen Build Script
# Targets: Windows 10/11 x64 (Native Execution Only)
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$SkipTests = $false,
    [string]$DistPath = "backend/dist-windows",
    [string]$WorkPath = "backend/build-windows"
)

$ErrorActionPreference = "Stop"

Write-Host "=== GLOBAL MARKET TERMINAL — Windows Backend Build ===" -ForegroundColor Cyan

# 1. Environment Verification
if ($env:OS -notlike "*Windows*") {
    Write-Error "This script must be executed on native Windows 10/11 x64."
    exit 1
}

$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
if ($arch -ne [System.Runtime.InteropServices.Architecture]::X64) {
    Write-Error "Windows x64 is required. Current architecture: $arch"
    exit 1
}

# 2. Check Python 3.11
$pythonCmd = "python"
if (Test-Path "backend/.venv/Scripts/python.exe") {
    $pythonCmd = Resolve-Path "backend/.venv/Scripts/python.exe"
}

$pyVer = & $pythonCmd --version 2>&1
Write-Host "Detected Python: $pyVer" -ForegroundColor Green

if ($pyVer -notmatch "3\.11") {
    Write-Warning "Python 3.11 is recommended for binary stability. Detected: $pyVer"
}

# 3. Check / Install requirements
Write-Host "Verifying backend dependencies..." -ForegroundColor Cyan
& $pythonCmd -m pip install --quiet --upgrade pip
& $pythonCmd -m pip install --quiet -r backend/requirements-lock.txt

# 4. Run PyInstaller
Write-Host "Compiling standalone backend with PyInstaller..." -ForegroundColor Cyan

# Clean previous build artifacts if needed
if (Test-Path $WorkPath) {
    Remove-Item -Recurse -Force $WorkPath
}

& $pythonCmd -m PyInstaller `
    --noconfirm `
    --clean `
    --distpath $DistPath `
    --workpath $WorkPath `
    backend/windows-backend.spec

# 5. Verify Output
$outputExe = Join-Path $DistPath "imt-backend\imt-backend.exe"
if (-not (Test-Path $outputExe)) {
    Write-Error "Backend build failed: $outputExe not found."
    exit 1
}

$size = (Get-Item $outputExe).Length
Write-Host "=== Backend Build Succeeded ===" -ForegroundColor Green
Write-Host "Output: $outputExe ($([math]::Round($size / 1MB, 2)) MB)"
