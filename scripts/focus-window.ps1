Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WinFocus {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
}
"@

$appWindows = (Get-Process -Name 'GLOBAL MARKET TERMINAL' -ErrorAction SilentlyContinue)

# Use scan to get HWND on Default desktop
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class DeskFinder {
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

$hDesk = [DeskFinder]::OpenDesktop("Default", 0, $false, 0x0100)
$targetHwnd = [IntPtr]::Zero

$cb = [DeskFinder+EnumWindowsProc]{
    param($hwnd, $lparam)
    $sb = New-Object System.Text.StringBuilder 512
    [DeskFinder]::GetWindowText($hwnd, $sb, 512) | Out-Null
    $title = $sb.ToString()
    if ($title -eq "GLOBAL MARKET TERMINAL" -and [DeskFinder]::IsWindowVisible($hwnd)) {
        $script:targetHwnd = $hwnd
        return $false
    }
    return $true
}

[DeskFinder]::EnumDesktopWindows($hDesk, $cb, [IntPtr]::Zero) | Out-Null
[DeskFinder]::CloseDesktop($hDesk) | Out-Null

if ($targetHwnd -ne [IntPtr]::Zero) {
    $hex = "0x{0:X}" -f $targetHwnd.ToInt64()
    Write-Host "Found GLOBAL MARKET TERMINAL window HWND: $hex" -ForegroundColor Cyan
    # 9 = SW_RESTORE, 1 = SW_SHOWNORMAL
    [WinFocus]::ShowWindow($targetHwnd, 9) | Out-Null
    [WinFocus]::SetForegroundWindow($targetHwnd) | Out-Null
    Write-Host "Window brought to foreground and focused successfully!" -ForegroundColor Green
} else {
    Write-Warning "Could not find visible window titled GLOBAL MARKET TERMINAL on Default desktop."
}
