$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$minutes = [int]((Get-Content (Join-Path $root '.env') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^POLL_INTERVAL_MINUTES=' } | ForEach-Object { $_.Split('=')[1] }) | Select-Object -First 1)
if (-not $minutes) { $minutes = 10 }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$root\scripts\run.ps1`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $minutes)
Register-ScheduledTask -TaskName 'Helpical Ticket Automation' -Action $action -Trigger $trigger -Description 'Synchronize Helpical tickets to Microsoft To Do' -Force
