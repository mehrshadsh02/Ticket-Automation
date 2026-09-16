$ErrorActionPreference = 'Stop'

Set-Location (Split-Path -Parent $PSScriptRoot)

$projectPath = (Get-Location).Path

$running = Get-Process -Name node -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Path -like "$projectPath*"
    }

if ($running) {
    Write-Host "Ticket-Automation sync is already running."
    exit 0
}

npm run sync