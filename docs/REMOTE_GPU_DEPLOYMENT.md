# ISEmoTalk - Group GPU inference; laptop frontend only

## Architecture - fixed decision

The laptop serves ONLY React/Vite. The group Linux GPU server runs BOTH the Express API and Python FastAPI inference, holding SQLite, recording uploads, and private model weights. Browser calls same-origin /api. Vite proxies /api via an SSH local-forward to the remote API, without directly exposing the server ports to the Internet.

    Laptop: React/Vite preview 127.0.0.1:5173
        /api -> 127.0.0.1:13001 (SSH forwarded)
        |
        group Linux GPU host, SSH
            Express API 127.0.0.1:3001 -> SQLite + server/data/uploads
                  |
                  | audio PATH on the SAME Linux filesystem
                  v
            FastAPI 127.0.0.1:8001 -> genuine ASR + genuine SER

This co-location is necessary: the current API passes a local file path to FastAPI, NOT the audio bytes. Running Node on Windows and Python on the Linux GPU without redesigning transport is broken. Do not simply change INFERENCE_URL and expect Windows file paths to resolve remotely.

The current server must be treated as a supervised research demo, NOT a public authenticated multi-tenant system.

## 1. Read-only group server inspection - user action

From Windows PowerShell, using the SSH alias already configured on the user's machine:

    ssh ftisu-ser

On the REMOTE Linux shell, run:

    hostname
    nvidia-smi
    df -h
    free -h
    python3 --version
    node --version
    pwd

Share only system specs/paths, never SSH keys, passwords or tokens. Check free storage before downloading any new weights.

## 2. Remote code and private assets

Keep the private research repository, trained heads, encoder and tokenizer assets OUT of the public web repository. Checkout the web code on the remote host:

    git fetch origin
    git switch feat/remote-gpu-full-pipeline-20261123
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    npm ci --no-audit --no-fund

Prepare inference/.env privately with the genuine adapters; use these illustrative keys, replacing the placeholder factory and config with the REAL private serving package paths:

    ISEMO_MODE=real
    ISEMO_ASR=phowhisper
    ISEMO_ASR_MODEL=vinai/PhoWhisper-medium
    ISEMO_ASR_DEVICE=auto
    # ISEMO_ASR_REVISION=<pin to the actual repository commit SHA after selection>
    ISEMO_DIARIZATION=none
    ISEMO_SER=checkpoint
    ISEMO_SER_FACTORY=actual_private_package.serving:build_model
    ISEMO_SER_CONFIG=/absolute/path/to/private/ser_config.json
    ISEMO_ALLOW_UNVERIFIED=0

Note: PhoWhisper-medium is a serious starting ASR candidate, not a validated winner. Compare held-out Vietnamese WER/CER and server memory with other sizes before selecting. Once selected, pin the exact Hugging Face commit SHA in ISEMO_ASR_REVISION so ASR runs can be reproduced. Never silently replace it with a mock or call a generic Whisper the research model.

The F4 private factory must load emotion2vec, PhoBERT/tokenizer, and the authentic F4 head with EXACT preprocessing, labels, model condition, and seed. A single model.pt is NOT a complete model. The already available historical weights are not proof of call-center accuracy.

Choose real Linux directories (examples only):

    export ISEMO_DATA_DIR=/path/on/server/isemotalk-data
    export ISEMO_UPLOADS_DIR="$ISEMO_DATA_DIR/uploads"
    export HF_HOME=/path/on/server/model-cache

Select a preconfigured GPU Python interpreter using ISEMO_PYTHON=/absolute/path/to/venv/bin/python if needed. Verify compatible torch/transformers versions and CUDA before installing. Use the server for all training/evaluation and model serving; the laptop needs no model weights or ML dependencies.

IMPORTANT: database from the laptop is NOT automatically moved into the server DB. Plan explicit backup/export/migration if previous call reviews are needed. Disable demo seeding on the remote host.

## 3. Validate research package and launch remote services

Run the existing private package verification procedure from docs/SER_PACKAGE_VERIFICATION.md against held-out audio with allowed use, model assets and correct label order. Compare serving outputs with research reference outputs under matched settings. Artifact SHA256 and a four-class sanity test are necessary but do not establish scientific reproduction or real-world call-center accuracy.

Remote Linux terminal 1:

    npm run remote:preflight
    npm run remote:server

Remote terminal 2:

    npm run remote:check

The first check may intentionally fail because the checkpoint has not yet been loaded in the running FastAPI process. After performing independent package verification, run one permitted 10-30 second Vietnamese recording on the REMOTE server:

    npm run remote:smoke -- /absolute/path/to/permitted_test_clip.wav
    npm run remote:check

This creates one REAL recorded call in remote SQLite and verifies that both ASR and SER processing stages are actual inference, not mock. Do not use an actual private customer recording unless authorized.

The preflight checks GPU, config and requires real ASR and real SER names; no assets are downloaded. The server launcher forces NODE_ENV=production and ISEMO_AUTO_SEED=0; Python and API bind localhost on ports 8001 and 3001. Health must show ASR and SER mock=false, ready=true. The SER checkpoint verification flag may remain false until first actual model load; run a genuine audio smoke test and then verify status. A healthy adapter alone does not prove accuracy.

## 4. Laptop - SSH tunnel and web ONLY

PowerShell terminal A:

    ssh -N -L 127.0.0.1:13001:127.0.0.1:3001 ftisu-ser

Keep the SSH terminal open. If tunnel cannot connect, DO NOT fall back to a local mock API.

Windows project checkout, PowerShell terminal B:

    git fetch origin
    git switch feat/remote-gpu-full-pipeline-20261123
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    npm run build
    npm run remote:web

Open http://127.0.0.1:5173. The remote:web launcher verifies the SSH-proxied API and rejects ASR or SER if mock=true or ready=false. It serves Vite preview only and does not start a local backend or Python service.

## 5. Acceptance tests before thesis demo

1. Real ASR and SER, no mocks. Full pretrained assets actually loaded on GPU host, and a permissioned held-out labeled audio example produces output.
2. Audio upload from laptop: stored on server; Node and Python resolve the exact same path; audio byte-range playback succeeds through SSH tunnel.
3. Real Vietnamese transcript/timestamps with measurable WER/CER; timestamp alignment verified independently.
4. Four-class SER predicted using matching F4 preprocessing, with correct class order and model provenance; held-out macro-F1/UAR recorded separately from QA business evaluation.
5. Mono unknown speaker remains unknown until reliable identification; no invented customer-specific KPI.
6. QA confirmation, case link, callback tasks and history persist after server restart in remote SQLite. Backup both DB and recordings before migrations.
7. Collect cold/warm latency, RAM/VRAM and failure/retry evidence on the real GPU host; test safe model coexistence. One GPU is enough if measured; do NOT run every experiment checkpoint simultaneously.
8. Validate no public ports 3001/8001; research models and recordings are private. Multi-user deployment needs auth, access control, audit and retention work.

## 6. Modeling and datasets

Use existing research data/assets, plus properly licensed public sources for software testing and benchmark work. Synthetic call-center corpora are useful for pipeline, metadata and UX tests, but synthetic emotion/sentiment tags are NOT equivalent to human-labeled acoustic emotion ground truth. Public ASR benchmarks measure WER, not SER or case-resolution outcomes. Do not train anything merely because the server has a GPU; first establish an evaluation protocol and domain-shift baseline.

## Boundaries

Current ISEmoTalk analyzes completed recordings. It is NOT a live answering bot and has no PBX/CRM connector. QA validates evidence; staff resolve tickets. The old laptop-based faster-whisper-small was a functional interim ASR, not the final ASR/model comparison.
