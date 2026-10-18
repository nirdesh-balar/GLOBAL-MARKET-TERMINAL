param([Parameter(Mandatory=$true)][int]$OwnedParent)
$ErrorActionPreference='Stop'
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($OwnedParent)
$queue = [System.Collections.Generic.Queue[int]]::new()
$queue.Enqueue($OwnedParent)
while ($queue.Count -gt 0) {
  $parent = $queue.Dequeue()
  foreach ($row in @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$parent")) {
    if ($ids.Add([int]$row.ProcessId)) {$queue.Enqueue([int]$row.ProcessId)}
  }
}
$before=@{}
foreach ($id in $ids) {try {$p=Get-Process -Id $id -ErrorAction Stop; $before[$id]=$p.TotalProcessorTime.TotalMilliseconds} catch {}}
$timer=[Diagnostics.Stopwatch]::StartNew()
Start-Sleep -Milliseconds 250
$rows=@()
foreach ($id in $ids) {
  try {
    $p=Get-Process -Id $id -ErrorAction Stop
    $rows += [pscustomobject]@{pid=$id;name=$p.ProcessName;rss_mib=$p.WorkingSet64/1MB;cpu_percent=100*($p.TotalProcessorTime.TotalMilliseconds-$before[$id])/[Math]::Max(1,$timer.ElapsedMilliseconds)/[Environment]::ProcessorCount;path=$p.Path}
  } catch {}
}
ConvertTo-Json -InputObject @($rows) -Depth 4 -Compress
