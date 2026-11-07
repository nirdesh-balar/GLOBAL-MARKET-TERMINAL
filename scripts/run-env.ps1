$workspace = "D:\Project\gmt-r2-release-candidate"
Set-Location $workspace

Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$nodeDir = "D:\Project\tools\node-v22.19.0-win-x64"
$gitDir = "D:\Project\tools\git\cmd"
$pyDir = "D:\Project\tools\python311"
$venvDir = "$workspace\backend\.venv\Scripts"
$env:PATH = "$nodeDir;$gitDir;$venvDir;$pyDir;$env:PATH"
$env:PYTHON = "$venvDir\python.exe"
$env:GMT_ARTIFACT_DIR = "C:\Users\Sir\.gemini\antigravity\brain\8f846995-2413-4f5e-8562-6282abaf07a7"

if ($args[0] -eq "-Command" -or $args[0] -eq "-c") {
    Invoke-Expression ($args[1..($args.Length-1)] -join " ")
    exit $LASTEXITCODE
}

& $args[0] $args[1..($args.Length-1)]
exit $LASTEXITCODE

