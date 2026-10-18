param([Parameter(Mandatory=$true)][string]$File)
$ErrorActionPreference='Stop'
$s=Get-AuthenticodeSignature -LiteralPath $File
[pscustomobject]@{status=$s.Status.ToString();subject=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{$null};path=$s.Path} | ConvertTo-Json -Compress
