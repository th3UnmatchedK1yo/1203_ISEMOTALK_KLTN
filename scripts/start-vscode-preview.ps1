#Requires -Version 5.1
<#
.SYNOPSIS
Windows LOCAL browser preview through VS Code Remote SSH forwarded FTISU port.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-vscode-preview.ps1 -LocalPort 13001
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-vscode-preview.ps1 -LocalPort 3101
#>
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$LocalPort = 13001,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -and $PSVersionTable.PSVersion.Major -ge 6) {
    throw 'Run this PowerShell script on the Windows LAPTOP, not inside the FTISU remote terminal.'
}
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $npm = Get-Command npm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1
    if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) {
        throw 'Vite dependencies missing. First run the read-only repair-node-local.ps1 -CheckOnly.'
    }
    $url = "http://127.0.0.1:$LocalPort/api/system/status"
    Write-Host "[VS Code port forward] Checking $url"
    try {
        $health = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 8
    } catch {
        throw "Cannot reach forwarded FTISU Express API. In VS Code REMOTE-SSH Ports tab: Forward remote port 3101 and change local address port to $LocalPort. Keep the FTISU API-only terminal open. Original error: $($_.Exception.Message)"
    }
    if ($health.api -ne 'ok') {
        throw "Port $LocalPort does not serve the expected ISEmoTalk API (api=ok missing). Do not use another unrelated app's port."
    }
    if ($health.inference.reachable -eq $false) {
        Write-Host '[PREVIEW ONLY] Real model inference is deliberately unavailable while FTISU trains.'
    }
    if (-not $SkipBuild) {
        Write-Host '[frontend] Building Windows static frontend locally...'
        & $npm.Source run build
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed (exit $LASTEXITCODE)." }
    }
    $env:ISEMO_REMOTE_API_PORT = [string]$LocalPort
    Write-Host "[frontend] Starting at http://127.0.0.1:5173 (through VS Code forwarded port $LocalPort)"
    & $npm.Source run remote:web:preview
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
