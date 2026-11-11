$fixture = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile','-STA','-File', (Join-Path $PSScriptRoot 'fixture.ps1'))
try {
  $handleFile = Join-Path $PSScriptRoot 'fixture-handle.txt'
  $result = ''
  Start-Sleep -Seconds 2
  $fixture.Refresh()
  $handle = [long](Get-Content $handleFile)
  Write-Output "fixture pid=$($fixture.Id) handle=$handle mainHandle=$($fixture.MainWindowHandle) title=$($fixture.MainWindowTitle) exited=$($fixture.HasExited)"
  for ($i = 0; $i -lt 30 -and $result -notmatch '"text"\s*:\s*"garden"'; $i++) {
    Start-Sleep -Milliseconds 500
    $result = (& powershell.exe -NoProfile -STA -File (Join-Path $PSScriptRoot '../selection.ps1') -ProbeProcessId $fixture.Id -ProbeHandle $handle 2>&1 | Out-String)
  }
  if ($result -notmatch '"text"\s*:\s*"garden"') { throw "UIA selection not found: $result" }
  Write-Output $result
} finally { Stop-Process -Id $fixture.Id -ErrorAction SilentlyContinue; Remove-Item $handleFile -ErrorAction SilentlyContinue }


