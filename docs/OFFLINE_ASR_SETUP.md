# ISEmoTalk — Offline Vietnamese transcription with cached faster-whisper-small

## Purpose

Enable **real ASR** without PyTorch or a new model download. The general-purpose CTranslate2 model Systran/faster-whisper-small was already seen in the laptop's Hugging Face cache. It is **not** PhoWhisper from the research project. It does **not** infer emotion. SER remains explicitly MOCK.

## Steps (Windows PowerShell)

1. Check currently free disk space:

    Get-PSDrive C

2. Update the repository (stop and preserve changes if git reports local modifications):

    git status
    git fetch origin
    git switch feat/thesis-demo-hardening-20261122
    git pull --ff-only origin feat/thesis-demo-hardening-20261122

3. Install only the smaller ASR runtime and configure a cached model (no torch or pretrained model downloads):

    powershell -ExecutionPolicy Bypass -File .\scripts\enable-offline-asr.ps1

The setup script checks free disk space, installs faster-whisper using pip --no-cache-dir, backs up any existing inference/.env, and writes the following configuration:

    ISEMO_MODE=mock
    ISEMO_ASR=faster_whisper
    ISEMO_ASR_MODEL=Systran/faster-whisper-small
    ISEMO_ASR_DEVICE=cpu
    ISEMO_DIARIZATION=none
    ISEMO_SER=mock
    ISEMO_ALLOW_UNVERIFIED=0

If already installed, use the same script with -SkipInstall to avoid reinstalling.

4. Restart the inference terminal with Ctrl+C and then start:

    npm run dev:inference

Keep the Node API and React web terminals running separately:

    npm run dev:api
    npm run dev:web

5. Check http://127.0.0.1:8001/v1/health. Expected ASR: adapter=faster_whisper, ready=true, mock=false if the cache is complete. SER: adapter=mock, mock=true. Speaker diarization: none. Overall system mode: mixed.

6. Open http://localhost:5173/calls/new. Upload a clearly spoken, consented 15–30 second Vietnamese WAV/MP3 **without a transcript**. Check processing steps, recorded audio, generated transcript, and review/SQLite. Compare recognized text to spoken words. Emotion prediction is still mock.

## Failure handling

- If faster-whisper package is missing: inspect the install log and inference/.venv Python environment.
- If model.bin/config.json/tokenizer.json is missing: a cache directory may exist but not have a complete snapshot. The adapter intentionally does not download a replacement. Send health JSON; do not install randomly.
- If model loading fails: send the exact FastAPI console error.
- A ~2-second clip or noisy call can produce empty or poor text. Use a longer clear test sample first. A filename ending in sad is not evidence of model prediction.
- Do not enable CUDA by default on the 4 GiB RTX 3050. The CPU INT8 option avoids Windows CUDA/cuDNN compatibility issues and protects VRAM.

## Explicit initialization and resource limits (2026-11-22)

With the inference server running and `faster_whisper` selected, initialize that same process explicitly:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8001/v1/warmup
```

This route loads the existing local cached ASR model and returns health. It does not download models, run SER or benchmark transcription. `components.asr.loaded=false` means the files are configured but the model has not been initialized; `loaded=true` means the server holds that model. The first actual transcription can still have additional startup cost. A failed model load remains visible as degraded readiness until a successful retry or restart. Health polling itself does not initialize models.

`ISEMO_ASR_CPU_THREADS=4` gives an explicit CPU budget. ASR still uses INT8 on CPU, one worker and the existing beam size. This improves predictability; no laptop speedup has been measured by this change.

`ISEMO_MAX_DECODED_MB=256` caps the retained float32 PCM cache, and `ISEMO_MAX_DURATION_SEC=10800` caps declared duration. The decoded byte limit usually applies earlier: approximately 23.3 minutes for stereo plus its mono mix, or 69.9 minutes for mono at 16 kHz. Metadata is checked before decoding, and a bounded decoder rejects files whose actual output exceeds the budget. This budget does not include ML model memory or all transient decoder allocations. Split long recordings into shorter clips; use a clear 15–30 second sample for the laptop acceptance check.

ASR, diarization and SER responses include evidence from the adapter that actually completed that stage. Anonymous pyannote speakers are left with unknown agent/customer roles; a reviewer must assign roles. The earlier first-speaker-is-agent assumption has been removed.

## Real SER remains a separate step

Direct inspection on 2026-11-22 confirmed all nine historical H5 `model.pt` checkpoints in the uploaded **main** `SER_EXPERIMENT_BACKUP_20261007` archive. Their model and metadata hashes match archived records. These heads still need exact feature extraction, tokenization, upstream backbones and a verified serving package. See [the current recovery audit](audits/inference-research-20261122.md). Do not call the generic Whisper ASR model PhoWhisper or a mock emotion prediction real SER.
