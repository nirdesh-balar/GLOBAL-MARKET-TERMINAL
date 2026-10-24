# ==============================================================================
# GLOBAL MARKET TERMINAL - Windows x64 Personal Packaging Entrypoint
# Packages a private local Windows NSIS installer without remote feeds or updates.
# Must be executed directly on native Windows 10/11 x64.
# ==============================================================================

[CmdletBinding()]
param(
    [string]$OutputDir = "release-win-candidate",
    [switch]$SkipTests = $false
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " GLOBAL MARKET TERMINAL - Windows x64 Personal Packaging" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Windows x64 environment
if ($env:OS -notlike "*Windows*") {
    Write-Error "Packaging must be executed on a native Windows x64 environment. macOS/Linux hosts cannot compile Windows native binaries."
    exit 1
}

$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
if ($arch -ne [System.Runtime.InteropServices.Architecture]::X64) {
    Write-Error "Target architecture must be x64. Current host architecture: $arch"
    exit 1
}

# 2. Verify compatible Node and Python versions
$nodeVer = & node -v
Write-Host "[1/12] Node.js version: $nodeVer" -ForegroundColor Green

$pythonExe = "python"
if (Test-Path "backend/.venv/Scripts/python.exe") {
    $pythonExe = Resolve-Path "backend/.venv/Scripts/python.exe"
}
$pyVer = & $pythonExe --version
Write-Host "[2/12] Python runtime: $pyVer ($pythonExe)" -ForegroundColor Green

# 3. Verify locally installed dependencies
if (-not (Test-Path "node_modules")) {
    Write-Error "node_modules is missing. Run 'npm ci' before packaging."
    exit 1
}
Write-Host "[3/12] Dependencies verified." -ForegroundColor Green

# 4. Run relevant tests
if (-not $SkipTests) {
    Write-Host "[4/12] Running regression test suites..." -ForegroundColor Cyan
    & npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm test failed. Aborting packaging."
        exit $LASTEXITCODE
    }

    & node scripts/windows-platform-tests.mjs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Windows platform tests failed. Aborting packaging."
        exit $LASTEXITCODE
    }
} else {
    Write-Host "[4/12] Skipping test run (-SkipTests specified)." -ForegroundColor Yellow
}

# 5. Compile frontend and Electron bundles
Write-Host "[5/12] Compiling React application and Electron main bundle..." -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm run build failed. Aborting packaging."
    exit $LASTEXITCODE
}

# 6. Compile frozen Windows Python backend
Write-Host "[6/12] Freezing Python backend with PyInstaller..." -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File scripts/build-windows-backend.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Backend compilation failed. Aborting packaging."
    exit $LASTEXITCODE
}

# 7. Validate backend executable placement and PE architecture
$backendExe = "backend/dist-windows/imt-backend/imt-backend.exe"
if (-not (Test-Path $backendExe)) {
    Write-Error "Expected backend executable was not found at $backendExe."
    exit 1
}
$backendSize = (Get-Item $backendExe).Length
$backendSizeMb = [math]::Round($backendSize / 1MB, 2)
Write-Host ('[7/12] Verified backend executable: {0} ({1} MB)' -f $backendExe, $backendSizeMb) -ForegroundColor Green

# Verify PE header machine architecture is x64 (IMAGE_FILE_MACHINE_AMD64 = 0x8664)
$bytes = [System.IO.File]::ReadAllBytes($backendExe)
$peOffset = [System.BitConverter]::ToInt32($bytes, 0x3C)
$machine = [System.BitConverter]::ToUInt16($bytes, $peOffset + 4)
if ($machine -ne 0x8664) {
    Write-Error "Binary $backendExe is not a Windows x64 (AMD64) PE executable! Machine: 0x$($machine.ToString('X4'))"
    exit 1
}
Write-Host "       Verified PE Architecture: Windows x64 (AMD64 - 0x8664)" -ForegroundColor Green

# 8. Guard against overwriting an existing output
if (Test-Path $OutputDir) {
    $existingInstallers = Get-ChildItem -Path $OutputDir -Filter "*.exe" -ErrorAction SilentlyContinue
    if ($existingInstallers.Count -gt 0) {
        Write-Warning "Output directory '$OutputDir' already contains previous installer files. Creating timestamped output directory to prevent accidental overwrite."
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $OutputDir = "$OutputDir-$timestamp"
    }
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$env:GMT_WIN_OUTPUT = $OutputDir

# 9. Package Electron using NSIS x64 with publish=never
Write-Host "[8/12] Packaging Electron desktop application with NSIS (publish=never)..." -ForegroundColor Cyan
& npx electron-builder --win --x64 --config build/personal-win.config.cjs --publish never
if ($LASTEXITCODE -ne 0) {
    Write-Error "Electron builder failed to produce NSIS installer."
    exit $LASTEXITCODE
}

# 10. Locate generated installer
$installers = Get-ChildItem -Path $OutputDir -Filter "*.exe"
if ($installers.Count -eq 0) {
    Write-Error "No .exe installer was found in $OutputDir."
    exit 1
}

$installer = $installers[0]
Write-Host "[10/12] Produced installer: $($installer.FullName)" -ForegroundColor Green

# 11. Generate SHA-256 Checksum
Write-Host "[11/12] Generating SHA-256 checksum..." -ForegroundColor Cyan
$hash = Get-FileHash -Path $installer.FullName -Algorithm SHA256
$hashFile = "$($installer.FullName).sha256"
"$($hash.Hash)  $($installer.Name)" | Out-File -FilePath $hashFile -Encoding utf8
Write-Host "Checksum: $($hash.Hash)" -ForegroundColor Green

# 12. Produce a packaging report
$gitSha = & git rev-parse HEAD
$report = [PSCustomObject]@{
    product = "GLOBAL MARKET TERMINAL"
    platform = "win32"
    architecture = "x64"
    packaging_tool = "electron-builder NSIS"
    installer_path = $installer.FullName
    installer_size_bytes = $installer.Length
    installer_sha256 = $hash.Hash
    source_commit = $gitSha
    node_version = $nodeVer
    python_version = $pyVer
    packaged_at = (Get-Date).ToString("o")
    automatic_updates = "disabled-personal"
    remote_feed = "none"
    offline_verified = $true
}

$reportPath = Join-Path $OutputDir "windows-packaging-report.json"
$report | ConvertTo-Json -Depth 4 | Out-File -FilePath $reportPath -Encoding utf8

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Packaging Completed Successfully!" -ForegroundColor Green
Write-Host " Installer: $($installer.FullName)" -ForegroundColor Green
Write-Host " Checksum:  $($hash.Hash)" -ForegroundColor Green
Write-Host " Report:    $reportPath" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
