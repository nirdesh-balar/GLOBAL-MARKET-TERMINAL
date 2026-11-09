$workspace = if ($env:GMT_WORKSPACE) { $env:GMT_WORKSPACE } else { (Split-Path -Parent $PSScriptRoot) }
Set-Location $workspace

Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

# Python venv integration
$venvDir = "$workspace\backend\.venv\Scripts"
if (Test-Path $venvDir) {
    $env:PATH = "$venvDir;$env:PATH"
    if (Test-Path "$venvDir\python.exe") {
        $env:PYTHON = "$venvDir\python.exe"
    }
}

if ($args.Length -gt 0) {
    if ($args[0] -eq "-Command" -or $args[0] -eq "-c") {
        Invoke-Expression ($args[1..($args.Length-1)] -join " ")
        exit $LASTEXITCODE
    }

    & $args[0] $args[1..($args.Length-1)]
    exit $LASTEXITCODE
}
