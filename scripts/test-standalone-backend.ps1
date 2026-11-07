$backendDir = "D:\Project\gmt-r2-release-candidate\backend\dist-windows\imt-backend"
$backendExe = "$backendDir\imt-backend.exe"
$testDataDir = Join-Path ([System.IO.Path]::GetTempPath()) ("gmt-backend-test-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $testDataDir -Force | Out-Null

$token = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")

Write-Host "Testing standalone backend: $backendExe" -ForegroundColor Cyan
Write-Host "Data directory: $testDataDir"
Write-Host "Auth Token: $token"

$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = $backendExe
$pinfo.WorkingDirectory = $backendDir
$pinfo.RedirectStandardOutput = $true
$pinfo.RedirectStandardError = $true
$pinfo.UseShellExecute = $false
$pinfo.EnvironmentVariables["IMT_DATA_DIR"] = $testDataDir
$pinfo.EnvironmentVariables["IMT_TOKEN"] = $token

$proc = [System.Diagnostics.Process]::Start($pinfo)
try {
    # Read first line of stdout (ready JSON)
    $readyLine = $proc.StandardOutput.ReadLine()
    Write-Host "Backend Output: $readyLine" -ForegroundColor Green
    $ready = $readyLine | ConvertFrom-Json
    if (-not $ready.ready) {
        Write-Error "Backend did not signal ready!"
        exit 1
    }
    $port = $ready.port
    Write-Host "Backend reported port: $port" -ForegroundColor Green

    $headers = @{ "Authorization" = "Bearer $token" }

    # Wait for Uvicorn event loop startup
    $healthUrl = "http://127.0.0.1:$port/health"
    $connected = $false
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Milliseconds 400
        try {
            $healthResp = Invoke-RestMethod -Uri $healthUrl -Headers $headers -TimeoutSec 3
            $connected = $true
            break
        } catch {
            Write-Host "Waiting for HTTP server to respond..."
        }
    }

    if (-not $connected) {
        Write-Error "Could not connect to backend HTTP server."
        exit 1
    }

    Write-Host "=== Backend /health response ===" -ForegroundColor Green
    $healthResp | ConvertTo-Json | Write-Host

    # Test /workspace
    $wsUrl = "http://127.0.0.1:$port/workspace"
    $wsResp = Invoke-RestMethod -Uri $wsUrl -Headers $headers -TimeoutSec 5
    Write-Host "Workspace Panes: $($wsResp.panes.Count)" -ForegroundColor Green
    Write-Host "Workspace Active Watchlist: $($wsResp.active_watchlist)" -ForegroundColor Green
    Write-Host "Workspace Revision: $($wsResp.watchlist_revision)" -ForegroundColor Green

    # Test /api/history/status
    $statusUrl = "http://127.0.0.1:$port/api/history/status"
    $statusResp = Invoke-RestMethod -Uri $statusUrl -Headers $headers -TimeoutSec 5
    Write-Host "Status history requests: $($statusResp.history_requests)" -ForegroundColor Green

    Write-Host "=== STANDALONE BACKEND TEST PASSED 100% ===" -ForegroundColor Green
} finally {
    if (-not $proc.HasExited) {
        $proc.Kill()
    }
    Remove-Item -Recurse -Force $testDataDir -ErrorAction SilentlyContinue
}
