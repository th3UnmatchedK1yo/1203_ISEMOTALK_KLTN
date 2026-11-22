# Local SER recovery inventory (no extraction, no downloads)
# PowerShell 5.1+; from the ISEmoTalk repository:
#   powershell -ExecutionPolicy Bypass -File scripts/diagnose-ser-local.ps1
#   -BackupDir is optional; pass ONLY a folder that actually exists.
param(
  [string]$BackupDir = (Join-Path $env:USERPROFILE 'Downloads')
)
$ErrorActionPreference = 'Continue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$inferenceDir = Join-Path $projectRoot 'inference'
$envFile = Join-Path $inferenceDir '.env'

# Match app/config.py's simple dotenv reader, but only retain non-secret keys.
# Never execute .env content or print the file itself. Existing process values win.
$safeKeys = @('ISEMO_PYTHON', 'ISEMO_ASR', 'ISEMO_ASR_MODEL', 'ISEMO_ASR_DEVICE', 'ISEMO_SER', 'HF_HUB_CACHE', 'HUGGINGFACE_HUB_CACHE', 'HF_HOME', 'XDG_CACHE_HOME')
$fileSettings = @{}
if (Test-Path -LiteralPath $envFile -PathType Leaf) {
  try {
    foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8 -ErrorAction Stop) {
      $entry = $line.Trim()
      if (-not $entry -or $entry.StartsWith('#') -or -not $entry.Contains('=')) { continue }
      $separator = $entry.IndexOf('=')
      $key = $entry.Substring(0, $separator).Trim()
      if ($safeKeys -contains $key -and -not $fileSettings.ContainsKey($key)) {
        $fileSettings[$key] = $entry.Substring($separator + 1).Trim().Trim([char]34).Trim([char]39)
      }
    }
  } catch {
    $fileSettings = @{}
    Write-Warning 'Could not read inference/.env; reporting process settings and defaults only.'
  }
}
$settings = @{}
$settingSources = @{}
foreach ($key in $safeKeys) {
  $processValue = [Environment]::GetEnvironmentVariable($key, 'Process')
  if ($null -ne $processValue) {
    $settings[$key] = $processValue
    $settingSources[$key] = 'process'
  } elseif ($fileSettings.ContainsKey($key)) {
    $settings[$key] = $fileSettings[$key]
    $settingSources[$key] = 'inference/.env'
  }
}

function Get-InventoryPath([string]$Value) {
  # Relative cache paths are relative to the inference service's working directory.
  # Do not expand variables or execute expressions from configuration values.
  if ($Value -eq '') { return $inferenceDir }
  if ($Value -eq '~') {
    $Value = $env:USERPROFILE
  } elseif ($Value -match '^~[\\/]') {
    $Value = Join-Path $env:USERPROFILE $Value.Substring(2)
  }
  if (-not [IO.Path]::IsPathRooted($Value)) {
    $Value = Join-Path $inferenceDir $Value
  }
  return [IO.Path]::GetFullPath($Value)
}

function Show-SnapshotFiles([string]$Directory, [string]$RepositoryName) {
  $groups = [ordered]@{
    'config candidates' = @('config.json', 'configuration.json', 'config.yaml', 'preprocessor_config.json')
    'tokenizer candidates' = @('tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.json', 'merges.txt', 'vocab.txt', 'bpe.codes', 'sentencepiece.bpe.model')
    'weight files/indexes' = @('model.bin', 'model.safetensors', 'pytorch_model.bin', 'emotion2vec_base.pt', 'model.pt', 'pytorch_model.pt', 'model.safetensors.index.json', 'pytorch_model.bin.index.json')
  }
  foreach ($label in $groups.Keys) {
    if ($label -eq 'tokenizer candidates' -and $RepositoryName -match 'emotion2vec') {
      Write-Host '    tokenizer: not applicable to the audio backbone'
      continue
    }
    $present = @($groups[$label] | Where-Object { Test-Path -LiteralPath (Join-Path $Directory $_) -PathType Leaf })
    $summary = if ($present.Count) { $present -join ', ' } else { 'none of the expected filenames found' }
    Write-Host ("    {0}: {1}" -f $label, $summary)
  }
  $required = @('config.json')
  if ($RepositoryName -match 'faster.whisper') {
    $required += @('tokenizer.json', 'model.bin')
  } elseif ($RepositoryName -match 'phobert') {
    $required += @('vocab.txt', 'bpe.codes')
  } elseif ($RepositoryName -match 'emotion2vec') {
    $required = @('configuration.json', 'emotion2vec_base.pt')
  }
  $presence = foreach ($name in $required) {
    $state = if (Test-Path -LiteralPath (Join-Path $Directory $name) -PathType Leaf) { 'present' } else { 'not found' }
    '{0}={1}' -f $name, $state
  }
  Write-Host ('    expected filenames: ' + ($presence -join '; '))
  try {
    $files = @(Get-ChildItem -LiteralPath $Directory -File -Force -ErrorAction Stop | Select-Object -First 41)
    $names = @($files | Select-Object -First 40 | Sort-Object Name | Select-Object -ExpandProperty Name)
    Write-Host ('    first-level files (up to 40): ' + $(if ($names.Count) { $names -join ', ' } else { '(none)' }))
    if ($files.Count -gt 40) { Write-Host '    File listing truncated; remaining entries were not inspected.' }
  } catch {
    Write-Host '    First-level file listing unavailable.'
  }
}

Write-Host "===== ISEmoTalk / SER local checks (read-only) ====="
Write-Host "Project: $projectRoot"
Write-Host "Backup folder: $BackupDir"
Write-Host "Available filesystem drives (GiB):"
Get-PSDrive -PSProvider FileSystem |
  Select-Object Name,
    @{Name='UsedGiB';Expression={[math]::Round($_.Used / 1GB, 2)}},
    @{Name='FreeGiB';Expression={[math]::Round($_.Free / 1GB, 2)}} |
  Format-Table -AutoSize
$cDrive = Get-PSDrive -Name C -ErrorAction SilentlyContinue
if ($cDrive -and $cDrive.Free -lt 8GB) {
  Write-Warning ("C: has only {0:N2} GiB free. DO NOT install large models or extract the full research archives yet." -f ($cDrive.Free / 1GB))
}
$backupExists = Test-Path -LiteralPath $BackupDir -PathType Container
if (-not $backupExists) {
  Write-Warning ("Backup folder does not exist: {0}. Default original location: {1}" -f $BackupDir, (Join-Path $env:USERPROFILE 'Downloads'))
}

Write-Host 'Physical RAM (OS-visible, GiB):'
try {
  $memory = Get-CimInstance -ClassName Win32_OperatingSystem -Property TotalVisibleMemorySize, FreePhysicalMemory -ErrorAction Stop
  if ($null -eq $memory.FreePhysicalMemory -or $memory.TotalVisibleMemorySize -le 0) {
    throw 'CIM did not return usable physical memory counters.'
  }
  Write-Host ('Total={0:N2}; Available={1:N2}' -f ($memory.TotalVisibleMemorySize * 1KB / 1GB), ($memory.FreePhysicalMemory * 1KB / 1GB))
} catch {
  Write-Host 'RAM information unavailable (Windows CIM query failed or is not supported).'
}

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

Write-Host 'Selected inference Python (same selection as the Node launcher):'
$pythonOverride = [Environment]::GetEnvironmentVariable('ISEMO_PYTHON', 'Process')
$py = Join-Path $inferenceDir '.venv\Scripts\python.exe'
$validPythonPath = $true
if ($pythonOverride) {
  $py = $pythonOverride
  if (-not [IO.Path]::IsPathRooted($py) -or $py -match '^[A-Za-z]:($|[^\\/])') {
    $validPythonPath = $false
    Write-Warning 'Process ISEMO_PYTHON must be an absolute executable path; no fallback interpreter will be run.'
  }
}
Write-Host ('Executable: {0} ({1})' -f $py, $(if ($pythonOverride) { 'process ISEMO_PYTHON' } else { 'project inference/.venv' }))
if ($fileSettings.ContainsKey('ISEMO_PYTHON') -and -not $pythonOverride) {
  Write-Host 'NOTE: ISEMO_PYTHON in inference/.env is not used by the Node launcher. Set it in the process environment to select that interpreter.'
}
if ($validPythonPath -and (Test-Path -LiteralPath $py -PathType Leaf)) {
  # importlib.metadata reads distribution metadata; it does not import these ML packages.
  $pythonInfo = @'
import sys
from importlib import metadata
print('Python version:', sys.version.split()[0])
print('Python executable:', sys.executable)
for name in ('torch', 'transformers', 'faster-whisper', 'ctranslate2'):
    try:
        installed = metadata.version(name)
    except metadata.PackageNotFoundError:
        installed = 'NOT INSTALLED'
    except Exception as exc:
        installed = 'metadata unavailable (' + type(exc).__name__ + ')'
    print(name + ': ' + installed)
'@
  & $py -B -c $pythonInfo
  if ($LASTEXITCODE -ne 0) { Write-Host 'Python metadata inspection failed; no package installation was attempted.' }
} elseif ($validPythonPath) {
  Write-Host 'Selected Python executable not found; package metadata inspection skipped.'
}
Write-Host 'Configured non-secret inference settings (process values override inference/.env):'
foreach ($key in @('ISEMO_ASR', 'ISEMO_ASR_MODEL', 'ISEMO_ASR_DEVICE', 'ISEMO_SER')) {
  if ($settings.ContainsKey($key)) {
    Write-Host ('{0}={1} [{2}]' -f $key, $settings[$key], $settingSources[$key])
  }
}

Write-Host "Saved research archives (top-level, no recursive disk scan):"
if ($backupExists) {
  Get-ChildItem -LiteralPath $BackupDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'SER_*' -and ($_.Name -like '*20261007*' -or $_.Name -like '*BACKUP*') } |
    Select-Object Name, @{Name='MB';Expression={[math]::Round($_.Length / 1MB, 1)}} |
    Format-Table -AutoSize
} else {
  Write-Host 'Archive listing skipped (backup directory does not exist).'
}

Write-Host 'Optional worktree archive (historical H5 heads were already recovered from the uploaded main archive):'
$worktree = $null
if ($backupExists) {
  $worktree = Get-ChildItem -LiteralPath $BackupDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'SER_WORKTREE_RESULTS_20261007*.tar.gz' } |
    Select-Object -First 1
}

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
} elseif ($backupExists) {
  Write-Host 'Optional worktree archive not found here. This does not mean the historical H5 heads are missing.'
} else {
  Write-Host 'Checkpoint archive check skipped because the specified backup folder does not exist.'
}

Write-Host 'Hugging Face cache inventory (presence only, not hash, revision identity or completeness verification):'
Write-Host 'Limits: 20 matching repositories, 10 snapshots per repository, 40 first-level filenames per snapshot. No blobs directory traversal.'
foreach ($key in @('HF_HUB_CACHE', 'HUGGINGFACE_HUB_CACHE', 'HF_HOME', 'XDG_CACHE_HOME')) {
  if ($settings.ContainsKey($key)) {
    Write-Host ('{0}={1} [{2}]' -f $key, $settings[$key], $settingSources[$key])
  }
}
try {
  if ($settings.ContainsKey('HF_HUB_CACHE')) {
    $hfHub = Get-InventoryPath $settings['HF_HUB_CACHE']
  } elseif ($settings.ContainsKey('HUGGINGFACE_HUB_CACHE')) {
    $hfHub = Get-InventoryPath $settings['HUGGINGFACE_HUB_CACHE']
  } elseif ($settings.ContainsKey('HF_HOME')) {
    $hfHub = Join-Path (Get-InventoryPath $settings['HF_HOME']) 'hub'
  } elseif ($settings.ContainsKey('XDG_CACHE_HOME')) {
    $hfHub = Join-Path (Get-InventoryPath $settings['XDG_CACHE_HOME']) 'huggingface\hub'
  } else {
    $hfHub = Join-Path $env:USERPROFILE '.cache\huggingface\hub'
  }
  Write-Host "Effective Hub directory: $hfHub"
  if (Test-Path -LiteralPath $hfHub -PathType Container) {
    $repositories = @(Get-ChildItem -LiteralPath $hfHub -Directory -ErrorAction Stop |
      Where-Object { $_.Name -match '^models--.*(whisper|emotion2vec|phobert)' } |
      Select-Object -First 21)
    if ($repositories.Count -eq 0) { Write-Host 'No matching Hub repository directories found.' }
    foreach ($repository in @($repositories | Select-Object -First 20)) {
      Write-Host ('Repository cache: ' + $repository.FullName)
      $snapshotRoot = Join-Path $repository.FullName 'snapshots'
      if (-not (Test-Path -LiteralPath $snapshotRoot -PathType Container)) {
        Write-Host '  No snapshots directory found.'
        continue
      }
      try {
        $snapshots = @(Get-ChildItem -LiteralPath $snapshotRoot -Directory -ErrorAction Stop | Select-Object -First 11)
        if ($snapshots.Count -eq 0) { Write-Host '  No snapshot directories found.' }
        foreach ($snapshot in @($snapshots | Select-Object -First 10)) {
          Write-Host ('  Snapshot/revision directory: ' + $snapshot.Name)
          Show-SnapshotFiles $snapshot.FullName $repository.Name
        }
        if ($snapshots.Count -gt 10) { Write-Host '  Snapshot listing truncated after 10 entries.' }
      } catch {
        Write-Host '  Snapshot inventory unavailable for this repository.'
      }
    }
    if ($repositories.Count -gt 20) { Write-Host 'Repository listing truncated after 20 matching entries.' }
  } else {
    Write-Host 'Effective Hub directory does not exist; no fallback cache was scanned.'
  }
} catch {
  Write-Host 'Hub inventory unavailable (invalid path or directory access failed).'
}
Write-Host 'Local model directories outside this Hub, including ModelScope caches, are not scanned.'
Write-Host 'These checks do not establish model loading, accuracy, latency, or exact research package identity.'
Write-Host 'DONE - no files changed, installed, extracted or deleted; no model initialized or downloaded.'
