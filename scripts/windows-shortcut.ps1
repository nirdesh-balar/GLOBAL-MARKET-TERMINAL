param([Parameter(Mandatory=$true)][string]$Shortcut)
$ErrorActionPreference='Stop'
if (!(Test-Path -LiteralPath $Shortcut)) {throw 'Start Menu shortcut missing'}
$shell=New-Object -ComObject Shell.Application
$folder=$shell.Namespace((Split-Path -Parent $Shortcut))
$item=$folder.ParseName((Split-Path -Leaf $Shortcut))
$wscript=New-Object -ComObject WScript.Shell
$link=$wscript.CreateShortcut($Shortcut)
[pscustomobject]@{app_user_model_id=$item.ExtendedProperty('System.AppUserModel.ID');target=$link.TargetPath} | ConvertTo-Json -Compress
