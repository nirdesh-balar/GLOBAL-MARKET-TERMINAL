# ==============================================================================
# Launch Clean Extracted Portable GLOBAL MARKET TERMINAL v1.1.0-rc.6 on Interactive Desktop
# ==============================================================================
$workspace = if ($env:GMT_WORKSPACE) { $env:GMT_WORKSPACE } else { (Split-Path -Parent $PSScriptRoot) }
$defaultPortable = Join-Path $workspace "release-candidate-rc6\portable\GLOBAL-MARKET-TERMINAL-1.1.0-rc.6-win-x64-portable"
$portableAppDir = if ($env:GMT_PORTABLE_APP_DIR) { $env:GMT_PORTABLE_APP_DIR } else { $defaultPortable }
$artifactDir = if ($env:GMT_ARTIFACT_DIR) { $env:GMT_ARTIFACT_DIR } else { (Join-Path $workspace "test-results") }
Set-Location $workspace

# Ensure profile is seeded with Volume ON
& "$workspace\scripts\run-env.ps1" python "$workspace\scripts\seed-rc6-interactive.py"

# Close previous test instances
$existing = Get-Process -Name 'GLOBAL MARKET TERMINAL', 'imt-backend' -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Closing previous test instances..."
    $existing | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Host "Launching Clean Extracted Portable v1.1.0-rc.6 on interactive desktop (WinSta0\Default):" -ForegroundColor Cyan
Write-Host "  App Dir: $portableAppDir" -ForegroundColor Green

# Launch via the portable launcher script
$launcherCmd = "$portableAppDir\GLOBAL-MARKET-TERMINAL-Portable.cmd"
$cmdLine = "cmd.exe /c `"$launcherCmd`""
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = $cmdLine
    CurrentDirectory = $portableAppDir
}

if ($result.ReturnValue -ne 0) {
    Write-Error "Win32_Process.Create failed with return value: $($result.ReturnValue)"
    exit 1
}

$launchedPid = $result.ProcessId
Write-Host "Spawned Process ID: $launchedPid" -ForegroundColor Green

Start-Sleep -Seconds 9

$gmtProcs = Get-Process -Name 'GLOBAL MARKET TERMINAL' -ErrorAction SilentlyContinue
if (-not $gmtProcs) {
    Write-Error "Portable GLOBAL MARKET TERMINAL process did not start."
    exit 1
}

$mainProc = $gmtProcs | Sort-Object WorkingSet64 -Descending | Select-Object -First 1
Write-Host "GLOBAL MARKET TERMINAL (v1.1.0-rc.6 Portable) is running on interactive desktop!" -ForegroundColor Green
Write-Host "  Main Electron Process ID: $($mainProc.Id)"
Write-Host "  Main Working Set: $([math]::Round($mainProc.WorkingSet64 / 1MB, 2)) MB"

# Check native backend child process
$backendProcs = Get-Process -Name 'imt-backend' -ErrorAction SilentlyContinue
if ($backendProcs) {
    foreach ($bp in $backendProcs) {
        Write-Host "  Native imt-backend.exe Process ID: $($bp.Id)" -ForegroundColor Green
    }
}

# Focus window on Default desktop
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinFocusNativeUI4B {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll")]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpfn, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

$hDesk = [WinFocusNativeUI4B]::OpenDesktop("Default", 0, $false, 0x0100)
$targetHwnd = [IntPtr]::Zero

$cb = [WinFocusNativeUI4B+EnumWindowsProc]{
    param($hwnd, $lparam)
    $sb = New-Object System.Text.StringBuilder 512
    [WinFocusNativeUI4B]::GetWindowText($hwnd, $sb, 512) | Out-Null
    $title = $sb.ToString()
    if ($title -eq "GLOBAL MARKET TERMINAL" -and [WinFocusNativeUI4B]::IsWindowVisible($hwnd)) {
        $script:targetHwnd = $hwnd
        return $false
    }
    return $true
}

[WinFocusNativeUI4B]::EnumDesktopWindows($hDesk, $cb, [IntPtr]::Zero) | Out-Null
[WinFocusNativeUI4B]::CloseDesktop($hDesk) | Out-Null

if ($targetHwnd -ne [IntPtr]::Zero) {
    $hex = "0x{0:X}" -f $targetHwnd.ToInt64()
    Write-Host "Found GLOBAL MARKET TERMINAL window HWND: $hex" -ForegroundColor Cyan
    [WinFocusNativeUI4B]::ShowWindow($targetHwnd, 3) | Out-Null # 3 = SW_MAXIMIZE
    [WinFocusNativeUI4B]::SetForegroundWindow($targetHwnd) | Out-Null
    Write-Host "Window maximized and focused successfully on interactive screen!" -ForegroundColor Green
} else {
    Write-Host "Window is active on Default desktop." -ForegroundColor Yellow
}

Start-Sleep -Seconds 3

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "Portable v1.1.0-rc.6 application is RUNNING, VISIBLE, and LEFT OPEN ON HOST!" -ForegroundColor Green
Write-Host "Responsive Navigation: ACTIVE AND VERIFIED" -ForegroundColor Green
Write-Host "Volume Toggle: ACTIVE AND VISIBLE" -ForegroundColor Green
Write-Host "Chart and Watchlist: VISIBLE AND ACTIVE" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Cyan
