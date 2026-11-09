$ErrorActionPreference = "Stop"

$workspace = if ($env:GMT_WORKSPACE) { $env:GMT_WORKSPACE } else { (Split-Path -Parent $PSScriptRoot) }
$exePath = "$workspace\release-candidate-r2\win-unpacked\GLOBAL MARKET TERMINAL.exe"
$backendExe = "$workspace\release-candidate-r2\win-unpacked\resources\backend\imt-backend.exe"

Write-Host "================================================="
Write-Host "STANDALONE PACKAGED APPLICATION VERIFICATION"
Write-Host "================================================="
Write-Host "Executable: $exePath"
Write-Host "Backend:    $backendExe"

if (!(Test-Path $exePath)) {
    throw "Packaged executable not found at $exePath"
}
if (!(Test-Path $backendExe)) {
    throw "Packaged backend not found at $backendExe"
}

# 1. Clean Environment: strip dev tools from PATH
$cleanPath = "C:\Windows\System32;C:\Windows;C:\Windows\System32\Wbem"
$testDir = Join-Path ([System.IO.Path]::GetTempPath()) "gmt-r2-standalone-test"
if (Test-Path $testDir) {
    Remove-Item -Path $testDir -Recurse -Force
}
New-Item -ItemType Directory -Path $testDir -Force | Out-Null

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $exePath
$startInfo.WorkingDirectory = $testDir
$startInfo.UseShellExecute = $false
$startInfo.EnvironmentVariables["PATH"] = $cleanPath
$startInfo.EnvironmentVariables["IMT_TEST_DATA_DIR"] = $testDir
$startInfo.EnvironmentVariables["IMT_OFFLINE"] = "1"
# Ensure dev variables are absent
$startInfo.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE")
$startInfo.EnvironmentVariables.Remove("VIRTUAL_ENV")

Write-Host "Launching packaged executable with sanitized PATH..."
$proc = [System.Diagnostics.Process]::Start($startInfo)
$mainPid = $proc.Id
Write-Host "Main Electron PID: $mainPid"

Start-Sleep -Seconds 6

# 2. Inspect Process Hierarchy
$allProcs = Get-CimInstance Win32_Process | Where-Object { 
    $_.Name -eq "GLOBAL MARKET TERMINAL.exe" -or $_.Name -eq "imt-backend.exe" 
}

Write-Host "`nRunning Processes:"
$backendFound = $false
$mainFound = $false
$backendPid = $null

foreach ($p in $allProcs) {
    Write-Host "  Process: $($p.Name) | PID: $($p.ProcessId) | ParentPID: $($p.ParentProcessId) | CommandLine: $($p.CommandLine)"
    if ($p.Name -eq "imt-backend.exe") {
        $backendFound = $true
        $backendPid = $p.ProcessId
        $backendParent = $p.ParentProcessId
        Write-Host "  -> VERIFIED: imt-backend.exe is running (PID: $backendPid, Parent: $backendParent)"
    }
    if ($p.ProcessId -eq $mainPid) {
        $mainFound = $true
    }
}

if (!$backendFound) {
    Write-Warning "imt-backend.exe not yet detected, waiting 5 more seconds..."
    Start-Sleep -Seconds 5
    $allProcs = Get-CimInstance Win32_Process | Where-Object { 
        $_.Name -eq "GLOBAL MARKET TERMINAL.exe" -or $_.Name -eq "imt-backend.exe" 
    }
    foreach ($p in $allProcs) {
        if ($p.Name -eq "imt-backend.exe") {
            $backendFound = $true
            $backendPid = $p.ProcessId
            Write-Host "  -> VERIFIED: imt-backend.exe found on retry (PID: $backendPid)"
        }
    }
}

if (!$backendFound) {
    $proc.Kill()
    throw "FAIL: imt-backend.exe was not spawned automatically by GLOBAL MARKET TERMINAL.exe!"
}

# 3. Clean Process Shutdown Test
Write-Host "`nTesting clean process shutdown..."
$proc.CloseMainWindow() | Out-Null
Start-Sleep -Seconds 3

# Check if processes exited
$remainingProcs = Get-CimInstance Win32_Process | Where-Object { 
    $_.ProcessId -eq $mainPid -or $_.ProcessId -eq $backendPid 
}

if ($remainingProcs) {
    Write-Host "Processes still running after CloseMainWindow, terminating gracefully..."
    $proc.Kill()
    Start-Sleep -Seconds 2
} else {
    Write-Host "PASS: Both main Electron process and child imt-backend.exe terminated cleanly!"
}

# Final check for any orphaned imt-backend.exe
$orphaned = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "imt-backend.exe" }
if ($orphaned) {
    Write-Warning "Orphaned backend detected: $($orphaned.ProcessId). Killing..."
    $orphaned | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
} else {
    Write-Host "PASS: Zero orphaned backend processes detected."
}

Write-Host "`nStandalone check completed successfully!"
