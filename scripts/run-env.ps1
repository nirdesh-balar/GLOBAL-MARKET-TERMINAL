$workspace = if ($env:GMT_WORKSPACE) { $env:GMT_WORKSPACE } else { (Split-Path -Parent $PSScriptRoot) }
Set-Location $workspace

Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# Portable tools integration (parameterized via environment variables or workspace-relative path)
$nodeDir = if ($env:GMT_NODE_DIR) { $env:GMT_NODE_DIR } else { (Join-Path $workspace "tools\node") }
$gitDir = if ($env:GMT_GIT_DIR) { $env:GMT_GIT_DIR } else { (Join-Path $workspace "tools\git\cmd") }
$pyDir = if ($env:GMT_PYTHON_DIR) { $env:GMT_PYTHON_DIR } else { (Join-Path $workspace "tools\python311") }
$venvDir = "$workspace\backend\.venv\Scripts"

if (Test-Path $nodeDir) {
    $env:PATH = "$nodeDir;$env:PATH"
}
if (Test-Path $gitDir) {
    $env:PATH = "$gitDir;$env:PATH"
}
if (Test-Path $venvDir) {
    $env:PATH = "$venvDir;$env:PATH"
    if (Test-Path "$venvDir\python.exe") {
        $env:PYTHON = "$venvDir\python.exe"
    }
} elseif (Test-Path $pyDir) {
    $env:PATH = "$pyDir;$env:PATH"
    if (Test-Path "$pyDir\python.exe") {
        $env:PYTHON = "$pyDir\python.exe"
    }
}

if (-not $env:GMT_ARTIFACT_DIR) {
    $env:GMT_ARTIFACT_DIR = Join-Path $workspace "test-results"
}

if ($args.Length -gt 0) {
    if ($args[0] -eq "-Command" -or $args[0] -eq "-c") {
        Invoke-Expression ($args[1..($args.Length-1)] -join " ")
        exit $LASTEXITCODE
    }

    & $args[0] $args[1..($args.Length-1)]
    exit $LASTEXITCODE
}
