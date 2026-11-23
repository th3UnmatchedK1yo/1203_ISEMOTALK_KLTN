#Requires -Version 5.1
<#
.SYNOPSIS
Checks local project processes before repairing Node dependencies and building.
.DESCRIPTION
Uses installed Node only, so it works after npm ci has left node_modules incomplete.
Close the demo/dev terminals with Ctrl+C first. Unknown port owners must be stopped
manually; this command never kills all node/python processes or arbitrary port owners.
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-node-local.ps1 -CheckOnly
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-node-local.ps1
.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-node-local.ps1 -StopProjectProcesses
#>
[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$StopProjectProcesses
)

$ErrorActionPreference = 'Stop'
try {
    $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction Stop
    $repairArguments = @((Join-Path $PSScriptRoot 'repair-node-local.mjs'))
    if ($CheckOnly) { $repairArguments += '--check-only' }
    if ($StopProjectProcesses) { $repairArguments += '--stop-project-processes' }
    & $nodeCommand.Source @repairArguments
    $repairExitCode = $LASTEXITCODE
    exit $repairExitCode
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
