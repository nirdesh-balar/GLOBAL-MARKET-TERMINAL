# ==============================================================================
# Launch Installed GLOBAL MARKET TERMINAL Desktop Application Interactively
# ==============================================================================
$appDir = Join-Path $env:LOCALAPPDATA "Programs\GLOBAL MARKET TERMINAL"
$appExe = Join-Path $appDir "GLOBAL MARKET TERMINAL.exe"

if (-not (Test-Path $appExe)) {
    Write-Error "Executable not found at: $appExe"
    exit 1
}

# Ensure no stale instance is holding the single instance lock
$existing = Get-Process -Name 'GLOBAL MARKET TERMINAL', 'imt-backend' -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Closing previous background instances to release single-instance lock..."
    $existing | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Host "Launching installed desktop application on interactive desktop (WinSta0\Default):" -ForegroundColor Cyan
Write-Host "  $appExe" -ForegroundColor Green

# Use WMI Win32_Process.Create so the process is created on the interactive user desktop
# and not bound to the runner's ephemeral job object.
$cmdLine = "`"$appExe`""
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $cmdLine
    CurrentDirectory = $appDir
}

if ($result.ReturnValue -ne 0) {
    Write-Error "Win32_Process.Create failed with return value: $($result.ReturnValue)"
    exit 1
}

$launchedPid = $result.ProcessId
Write-Host "Spawned Process ID: $launchedPid" -ForegroundColor Green

Start-Sleep -Seconds 6

$proc = Get-Process -Id $launchedPid -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Error "Process exited shortly after launch."
    exit 1
}

Write-Host "GLOBAL MARKET TERMINAL is running on interactive desktop!" -ForegroundColor Green
Write-Host "  Process ID: $($proc.Id)"
Write-Host "  Process Name: $($proc.ProcessName)"
Write-Host "  Working Set: $([math]::Round($proc.WorkingSet64 / 1MB, 2)) MB"

# Check backend process spawned by the application
$backend = Get-Process -Name imt-backend -ErrorAction SilentlyContinue
if ($backend) {
    Write-Host "  Backend Process ID: $($backend.Id)" -ForegroundColor Green
    Write-Host "  Backend Working Set: $([math]::Round($backend.WorkingSet64 / 1MB, 2)) MB"
}

Write-Host "Application is active, visible, and left open on the desktop for review." -ForegroundColor Cyan
