$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Ticket-Automation*' })) { npm run sync }
