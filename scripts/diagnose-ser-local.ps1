# Local SER recovery inventory (no extraction, no downloads)
# PowerShell 5.1+; from the ISEmoTalk repository:
#   powershell -ExecutionPolicy Bypass -File scripts/diagnose-ser-local.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/diagnose-ser-local.ps1 -BackupDir "D:\Backup\SER"
param(
  [string]$BackupDir = (Join-Path $env:USERPROFILE 'Downloads')
)
$ErrorActionPreference = 'Continue'

Write-Host "===== ISEmoTalk / SER local checks (read-only) ====="
Write-Host "Backup folder: $BackupDir"
Write-Host "Free C: drive:"
Get-PSDrive C | Select-Object Name, Used, Free | Format-Table -AutoSize

Write-Host "NVIDIA GPU:"
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  & nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader
} else {
  Write-Host "nvidia-smi not found on PATH"
}

Write-Host "Audio tools:"
foreach ($cmd in @('ffmpeg','ffprobe')) {
  $found = Get-Command $cmd -ErrorAction SilentlyContinue
  Write-Host ("{0}: {1}" -f $cmd, $(if ($found) { $found.Source } else { 'MISSING' }))
}

Write-Host "Python inference venv:"
$py = Join-Path (Get-Location) 'inference\.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $py) {
  & $py -c "import importlib.util; print('torch:', bool(importlib.util.find_spec('torch'))); print('transformers:', bool(importlib.util.find_spec('transformers')))"
} else {
  Write-Host 'No local inference/.venv found here'
}

Write-Host "Saved research archives (top-level, no recursive disk scan):"
if (Test-Path -LiteralPath $BackupDir) {
  Get-ChildItem -LiteralPath $BackupDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'SER_*' -and ($_.Name -like '*20261007*' -or $_.Name -like '*BACKUP*') } |
    Select-Object Name, @{Name='MB';Expression={[math]::Round($_.Length / 1MB, 1)}} |
    Format-Table -AutoSize
} else {
  Write-Host 'Backup directory not found'
}

Write-Host "Known-important H5 checkpoint archive:"
$worktree = Get-ChildItem -LiteralPath $BackupDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'SER_WORKTREE_RESULTS_20261007*.tar.gz' } |
  Select-Object -First 1

if ($null -ne $worktree) {
  Write-Host "Found: $($worktree.Name), $([math]::Round($worktree.Length/1MB, 1)) MB"
  if (Get-Command tar -ErrorAction SilentlyContinue) {
    Write-Host 'Checkpoint member paths (archive listing only; NOTHING extracted):'
    & tar -tzf $worktree.FullName 2>&1 |
      Where-Object { $_ -match 'artifacts[/\\]h5[/\\].*model\.pt$' } |
      Select-Object -First 20
  } else {
    Write-Host 'tar not found; cannot list archive entries'
  }
} else {
  Write-Warning 'SER_WORKTREE_RESULTS_20261007.tar.gz NOT FOUND at this location. This is the archive holding nine H5 model.pt files per the October handoff.'
}

Write-Host "Existing Hugging Face cache folders:"
$hfHub = Join-Path $env:USERPROFILE '.cache\huggingface\hub'
if (Test-Path -LiteralPath $hfHub) {
  Get-ChildItem -LiteralPath $hfHub -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'PhoWhisper|faster.whisper|whisper' } |
    Select-Object -ExpandProperty Name
} else {
  Write-Host 'No hub cache in the default location'
}
Write-Host 'DONE — no files changed, installed, extracted or deleted.'
