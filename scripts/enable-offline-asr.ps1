# ISEmoTalk: enable local cached Whisper ASR without PyTorch.
# Run from PowerShell in the repo: powershell -ExecutionPolicy Bypass -File .\scripts\enable-offline-asr.ps1
# No trained SER weights, datasets, or HF models are downloaded.
param(
  [switch]$SkipInstall
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "inference\.venv\Scripts\python.exe"
$envFile = Join-Path $root "inference\.env"
$smallCache = Join-Path $env:USERPROFILE ".cache\huggingface\hub\models--Systran--faster-whisper-small\snapshots"

Write-Host "ISEmoTalk - enable cached faster-whisper SMALL ASR (CPU INT8)"
$cDrive = Get-PSDrive -Name C -ErrorAction Stop
$freeGB = [math]::Round($cDrive.Free / 1GB, 2)
Write-Host ("C: free = {0} GiB" -f $freeGB)
if ($cDrive.Free -lt 3GB) {
  throw "Less than 3 GiB free. Aborting before installing anything."
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  throw "Missing inference venv: $python. Start by restoring the existing lightweight inference/.venv; do not reinstall everything blindly."
}

if (-not $SkipInstall) {
  Write-Host "Installing the smaller faster-whisper runtime without pip cache. No torch, model or GPU downloads."
  & $python -m pip install --no-cache-dir "faster-whisper>=1.1,<2"
  if ($LASTEXITCODE -ne 0) { throw "pip install failed; configuration was not modified." }
} else {
  Write-Host "Skipping pip installation as requested."
}

if (Test-Path -LiteralPath $envFile) {
  $backup = $envFile + ".bak." + (Get-Date -Format "yyyyMMdd_HHmmss")
  Copy-Item -LiteralPath $envFile -Destination $backup -ErrorAction Stop
  Write-Host "Backed up existing .env to $backup"
  $lines = @(Get-Content -LiteralPath $envFile -Encoding UTF8)
} else {
  $lines = @("# ISEmoTalk local inference. Other models stay disabled until verified.")
}

$config = [ordered]@{
  "ISEMO_MODE" = "mock"
  "ISEMO_ASR" = "faster_whisper"
  "ISEMO_ASR_MODEL" = "Systran/faster-whisper-small"
  "ISEMO_ASR_DEVICE" = "cpu"
  "ISEMO_DIARIZATION" = "none"
  "ISEMO_SER" = "mock"
  "ISEMO_ALLOW_UNVERIFIED" = "0"
}
$seen = @{}
$newLines = New-Object 'System.Collections.Generic.List[string]'
foreach ($line in $lines) {
  if ($line -match '^\s*(ISEMO_[A-Z_]+)\s*=') {
    $key = $Matches[1]
    if ($config.Contains($key)) {
      if (-not $seen.ContainsKey($key)) {
        $newLines.Add(('{0}={1}' -f $key, $config[$key]))
        $seen[$key] = $true
      }
      continue
    }
  }
  $newLines.Add([string]$line)
}
foreach ($key in $config.Keys) {
  if (-not $seen.ContainsKey($key)) {
    $newLines.Add(('{0}={1}' -f $key, $config[$key]))
  }
}
[System.IO.File]::WriteAllLines(
  $envFile,
  [string[]]$newLines.ToArray(),
  (New-Object System.Text.UTF8Encoding -ArgumentList $false)
)
Write-Host "Configured offline CPU INT8 ASR in inference/.env. SER remains MOCK."

if (Test-Path -LiteralPath $smallCache -PathType Container) {
  $complete = @(Get-ChildItem -LiteralPath $smallCache -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      (Test-Path (Join-Path $_.FullName "model.bin")) -and
      (Test-Path (Join-Path $_.FullName "config.json")) -and
      (Test-Path (Join-Path $_.FullName "tokenizer.json"))
    })
  if ($complete.Count -gt 0) {
    Write-Host "Complete cached small model snapshot found."
  } else {
    Write-Warning "Cache directory exists but no verified complete snapshot found. Health will show unavailable. No model downloaded."
  }
} else {
  Write-Warning "No small-model cache directory found. Health will show unavailable. No model downloaded."
}

Write-Host "Restart npm run dev:inference, then open http://127.0.0.1:8001/v1/health"
Write-Host "Expected: ASR adapter=faster_whisper, mock=false, ready=true if cache complete."
Write-Host "This is Whisper SMALL, not the original PhoWhisper research model."
