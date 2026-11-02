# ISEmoTalk — Offline Vietnamese transcription with cached faster-whisper-small

## Purpose

Enable **real ASR** without PyTorch or a new model download. The general-purpose CTranslate2 model Systran/faster-whisper-small was already seen in the laptop's Hugging Face cache. It is **not** PhoWhisper from the research project. It does **not** infer emotion. SER remains explicitly MOCK.

## Steps (Windows PowerShell)

1. Check currently free disk space:

    Get-PSDrive C

2. Update the repository (stop and preserve changes if git reports local modifications):

    git status
    git fetch origin
    git switch feat/offline-faster-whisper-asr-20261102
    git pull --ff-only origin feat/offline-faster-whisper-asr-20261102

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

## Real SER remains a separate step

The Windows Downloads archive SER_WORKTREE_RESULTS_20261007.tar.gz contains nine trained H5 model.pt checkpoints. These files still need their exact architecture, preprocessing, tokenization, label mapping and upstream encoder/backbone before use in inference. Do not extract the full archive or download datasets for web inference. Do not call the generic Whisper ASR model PhoWhisper or a mock emotion prediction real SER.
