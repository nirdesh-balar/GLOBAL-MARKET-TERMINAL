$exePath = if ($args[0]) { $args[0] } else { Join-Path $PSScriptRoot "..\backend\dist-windows\imt-backend\imt-backend.exe" }
$bytes = [System.IO.File]::ReadAllBytes($exePath)
$peOffset = [System.BitConverter]::ToInt32($bytes, 0x3C)
$machine = [System.BitConverter]::ToUInt16($bytes, $peOffset + 4)
Write-Host "Machine: 0x$($machine.ToString('X4'))"
if ($machine -eq 0x8664) {
    Write-Host "Architecture: PE32+ Windows x64 (AMD64)" -ForegroundColor Green
}
$hash = Get-FileHash -Path $exePath -Algorithm SHA256
Write-Host "Backend SHA-256: $($hash.Hash)"
Write-Host "Backend Size: $((Get-Item $exePath).Length) bytes"

