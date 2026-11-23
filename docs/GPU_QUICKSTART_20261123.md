# FTISU CUDA launch — single operator checklist (23 November 2026)

**Never paste raw Python source at a Bash prompt.** All commands below are valid Bash commands. No root privileges, no training venv mutation, no CPU training fallback.

## Goal

Windows laptop = React interface only.
FTISU Linux = Express + persistent SQLite/recordings + Python CUDA inference.
GPU: RTX 4060 Ti 16 GB. Node API: 127.0.0.1:3101 (do not touch :3001). Python inference: 127.0.0.1:8001. Browser API proxy over SSH tunnel: laptop 127.0.0.1:13001 -> FTISU 127.0.0.1:3101.

## One-time prep on FTISU server

    cd ~/services/isemotalk
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    bash scripts/bootstrap-gpu-host.sh --with-ml
    bash scripts/stage-gpu-models.sh

The first script downloads verified Node v22.17.1 into ~/.local/opt, installs npm dependencies and creates inference/.venv. It installs the pinned CUDA-compatible research serving stack in THAT venv, not ~/research/paper_2/.venv.

The second script uses a separate checkout of the PRIVATE research-serving branch; pins public PhoWhisper-base, emotion2vec_base and PhoBERT-base-v2 to research revisions; locates the historical M1 seed13 head from existing research artifacts or backup; generates SHA256 manifest; configures genuine ASR + SER adapters; creates an external VNEMOS four-class sanity manifest only when local legally usable corpus files exist; then runs held-out sanity verification. It never generates fake weights or predictions and never alters the original research training checkout.

If a private checkout is absent, it clones using the existing local research repository's Git remote. Otherwise an authorized remote must be supplied separately with ISEMO_PRIVATE_SER_REMOTE. Do NOT publish credentials, checkpoint weights or research recordings to the public web repo.

If the historical checkpoint cannot be located on server, provide ONLY authentic model.pt and matching metadata.json for M1/seed13 under ~/services/isemotalk-private/head-m1-seed13; the script then resumes. Do not train all nine old heads merely to restore one deployed model.

## Test the full model and start services

After both scripts succeed:

    source ~/.local/share/isemotalk-node-env.sh
    npm run remote:preflight
    npm run remote:server

Remote server starts both services in one terminal and keeps them alive. In another SSH terminal:

    source ~/.local/share/isemotalk-node-env.sh
    npm run remote:check
    npm run remote:smoke -- /absolute/path/to/consented_short_vi_clip.wav
    npm run remote:check

A real inference smoke creates one permanent test call on the remote SQLite database. It only passes when ASR and SER stages are genuinely executed (not mock) and SER has passed the configured independent verification. Use a short permitted file with clear Vietnamese. Smoke success proves pipeline wiring, NOT a published quality metric.

## Laptop: run frontend only

SSH tunnel in Windows PowerShell:

    ssh -N -L 127.0.0.1:13001:127.0.0.1:3101 ftisu-ser

Second PowerShell in laptop web checkout:

    git fetch origin
    git switch feat/remote-gpu-full-pipeline-20261123
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    npm ci
    npm run build
    npm run remote:web

Open http://127.0.0.1:5173. Do NOT run local dev:api or dev:inference with this setup. New calls are stored on FTISU, existing Windows call database is NOT automatically migrated.

## GPU operating policy

When a teammate trains a heavy model, STOP the inference supervisor first if GPU/VRAM is insufficient. A single worker handles inference. Training scripts must hard-fail without CUDA, never silently train on CPU. The historical trained H5 heads do not need to be retrained unless evaluation establishes a scientific reason.

## Necessary evidence for graduation report

1. Model identity and exact pretrained revisions; model head SHA, seed, condition, label order, preprocessing contract.
2. Real ASR WER/CER on a permitted reference transcript; separate from SER.
3. F4 held-out macro-F1/UAR/confusion matrix on an independent corpus; report domain shift honestly.
4. End-to-end upload/playback/review/case persistence/restart on FTISU.
5. Measured CUDA VRAM, cold/warm times, GPU utilization, error recovery. No invented improvements over random or keyword QA triage.
6. Keep research dataset, public synthetic call-center demos and business QA labels clearly separate.

## If a command fails

Send ONLY the first error and last 40 lines (omit tokens/credentials). Scripts stop when a prerequisite fails; do not run sudo, kill all node processes, delete old dataset/DB, or set ISEMO_ALLOW_UNVERIFIED=1 to force a green check.
