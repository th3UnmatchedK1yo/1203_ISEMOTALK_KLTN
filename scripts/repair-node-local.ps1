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
    # Get-Command can return several installed Node applications. -All preserves
    # execution precedence; select one before reading Source or invoking it.
    $nodeCommand = Get-Command node.exe -CommandType Application -All -ErrorAction Stop | Select-Object -First 1
    $nodeExecutable = [string]$nodeCommand.Source
    if ([string]::IsNullOrWhiteSpace($nodeExecutable) -or
        -not [System.IO.Path]::IsPathRooted($nodeExecutable) -or
        -not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
        throw 'Could not resolve one installed Node executable from PATH.'
    }
    $repairArguments = @((Join-Path $PSScriptRoot 'repair-node-local.mjs'))
    if ($CheckOnly) { $repairArguments += '--check-only' }
    if ($StopProjectProcesses) { $repairArguments += '--stop-project-processes' }
    & $nodeExecutable @repairArguments
    $repairExitCode = $LASTEXITCODE
    exit $repairExitCode
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
