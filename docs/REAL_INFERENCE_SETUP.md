# ISEmoTalk — real audio / real inference

This branch adds upload/import UI and asynchronous job monitoring. It does not automatically make SER predictions real.

## What is available

- Upload a spoken WAV/MP3/M4A (rather than the synthetic tone WAVs from seed:demo).
- Optional timestamped transcript JSON/CSV bypasses ASR.
- Import existing analysis JSON/CSV (without claiming imported labels were inferred here).
- See FastAPI ASR/SER health and per-stage processing status, failures and retries.
- Review actual audio and correct transcript, speaker, emotion and notes; persist in SQLite.

## Launch (Windows PowerShell)

In the project folder, open separate PowerShell terminals for:

    npm run dev:api
    npm run dev:web
    npm run dev:inference

The third command requires inference/.venv. For an empty Python environment and enough free disk space, use a compatible Python (e.g. 3.11):

    py -3.11 -m venv inference\.venv
    .\inference\.venv\Scripts\python.exe -m pip install -r inference\requirements-core.txt

The lightweight core dependencies do not include GPU PyTorch or pretrained weights. You need FFmpeg and FFprobe in PATH.

Check http://127.0.0.1:8001/v1/health and http://127.0.0.1:3001/api/system/status. Then open http://localhost:5173/calls/new.

Before installing large ML packages, run nvidia-smi, Get-PSDrive C and Get-Command ffmpeg. The laptop's RTX 3050 VRAM must be inspected, not assumed. Do not delete model caches or research backups blindly.

## Staged adoption

**A. Real audio only.** Record a short Vietnamese conversation you have permission to process. Upload it via Calls > Thêm cuộc gọi. Attach a transcript JSON file with start/end timestamps if available (see docs/sample-transcript.json). The web plays the actual recording but if either model adapter is in mock mode, output is labeled mock. Uploading real audio does not itself create true emotion inference.

**B. Real ASR with mock SER.** Inspect disk and available Hugging Face cache first. After a version-compatible installation of CUDA PyTorch and transformers and a locally accessible PhoWhisper model, copy inference/.env.example to inference/.env and set:

    ISEMO_MODE=mock
    ISEMO_ASR=phowhisper
    ISEMO_SER=mock
    ISEMO_DIARIZATION=none
    ISEMO_ASR_MODEL=vinai/PhoWhisper-small
    ISEMO_ASR_DEVICE=auto

Restart FastAPI and confirm ASR is ready and mock=false in /v1/health. For mono recordings, the app still needs human speaker assignment if diarization is unavailable. The SER output remains mock.

**C. Real ASR + real SER.** Restore the precise research inference code and the selected trained checkpoint from the October 2026 backup. The web repository does not contain the trained research model's serving factory. Its current CheckpointSer adapter requires a private importable module and a configuration. It expects a build_model(config) function returning a model implementing predict(waveform_16khz_float32, text, speaker), producing fused/acoustic/lexical four-class probability arrays. Preserve the exact class mapping, feature preprocessing, tokenizer/encoder, and original trained weights.

Set ISEMO_SER=checkpoint, ISEMO_SER_FACTORY, ISEMO_SER_CONFIG in the private inference/.env only after implementing the factory and restoring paths. Validate against held-out examples using python -m app.verify with the research-appropriate macro-F1 threshold, then recheck checkpoint hashes; the current verifier hashes the config file but not all referenced weight bytes. Never enable ISEMO_ALLOW_UNVERIFIED for the thesis demonstration.

Do not infer that an arbitrary model.pt is deployable without its model architecture. For references to H5 checkpoints, look in the handoff for SER_WORKTREE_RESULTS_20261007.tar.gz and extract only relevant files after confirming disk space.

## Input examples

- docs/sample-transcript.json: timestamped utterances (seconds); no model predictions.
- docs/sample-results.json: precomputed prediction import format. These example labels are synthetic.
- CSV: start,end,text,speaker,emotion,confidence.

For genuine customer recordings, get consent/permission and avoid uploading them or model weights to GitHub. This development app has no authentication and should stay local.
