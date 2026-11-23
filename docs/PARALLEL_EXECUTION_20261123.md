# ACTIVE 3-LANE PLAN: RUN THESE IN PARALLEL

### FTISU Linux Bash - launch THREE CPU/network data downloads (returns immediately)

    cd ~/services/isemotalk
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    bash scripts/launch-parallel-datasets.sh

This launches:
- OneVoice all 1,200 synthetic call WAVs (business QA/audio pipeline tests; noncommercial).
- FLEURS vi_vn TEST 120 real speech clips (ASR WER evaluation, NOT call-center speech).
- FPT FOSD 100 real speech clips (ASR diagnostic, NOT independent benchmark if ASR pretrained on FOSD).
Separate Python data venv; no torch/CUDA, no changes to existing training venv. Results/logs remain in ~/services/isemotalk-private. Data jobs survive disconnect.

### FTISU SECOND Linux Bash terminal - CUDA experiments while data downloads

    cd ~/services/isemotalk
    bash scripts/run-qa-replications.sh

The original QA seed2026 experiment ALREADY FINISHED (synthetic test macro-F1 0.835, P@25 0.64). Do NOT train it again. Replication runner computes fixed-keyword/random baselines for that same heldout split, then runs only seeds 2027 and 2028 in sequence on the one GPU. It refuses a second copy or GPU collision. Results are saved in private logs and checkpoint directories, never the public repo.

### FTISU THIRD Linux Bash terminal - read-only status

    cd ~/services/isemotalk
    bash scripts/monitor-parallel.sh

Existing npm run remote:api-preview should STAY running at 127.0.0.1:3101 in its own terminal. It does not touch GPU; it serves QA/case frontend without accepting new AI jobs.

### Windows LOCAL PowerShell - NOT the FTISU Bash prompt

Open Windows Start -> type "PowerShell" -> open **Windows PowerShell**.
Do NOT paste the Windows C:\ path into VS Code terminal labeled emotalk@ftisu.
In the VS Code Remote SSH window, open PORTS panel -> forward FTISU 3101 -> local 13001, Private.
Test Windows browser: http://127.0.0.1:13001/api/system/status
Then in Windows PowerShell:

    cd C:\Users\Legion\Documents\1203_KLTN
    git status --short
    git fetch origin
    git switch feat/remote-gpu-full-pipeline-20261123
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-node-local.ps1 -CheckOnly
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-vscode-preview.ps1 -LocalPort 13001

Keep untracked db-check-result.json; git switch is safe only if it does not overwrite local changes. Open http://127.0.0.1:5173. This is a frontend/QA database preview and explicitly labels unavailable inference. Windows does not need any ML dependencies.

### AI assistant - source engineering

Owns downloadable data pipelines, heldout QA baselines, independent CUDA replications, user-friendly API preview warnings, strict database/model lineage, browser/backend/Python CI, and subsequent authentic PhoWhisper/F4 serving. Running code on FTISU still requires a user's authorized SSH shell.

---
# ISEmoTalk - 3 parallel workflows (2026-11-23)

Goal: FTISU trains a real call-center QA classifier on CUDA, Windows runs only the web client, assistant owns the GitHub code and database. Do not buy a VPS or train on the laptop.

## A. FTISU terminal 1: real CUDA QA training (user operates)

Commands on FTISU Linux:

    cd ~/services/isemotalk
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    bash scripts/train-callcenter-qa.sh

The old log proves Node 22, npm 10, PyTorch 2.15.0+cu132, TorchAudio 2.11.1, Transformers 5.15, and CUDA were installed. A bootstrap bug that checked optional FunASR in --with-ml mode was fixed. No need to reinstall all JS/Python packages just to begin QA training.

This task downloads pinned OneVoice synthetic Vietnamese call-center metadata, first 24 WAV samples, and fine-tunes an XLM-R attention classifier. It MUST fail if CUDA is unavailable. Checkpoint: ~/services/isemotalk-private/models/qa-xlm-r-seed2026-v1; training log: ~/services/isemotalk-private/logs/qa-xlm-r-seed2026-v1.log. QA target: call-level needs_attention, NOT four-class SER.

During training, do not start F4 or PhoWhisper inference on the same GPU if competing for VRAM.

## B. FTISU terminal 2: safe SQLite + Express API preview

    cd ~/services/isemotalk
    source ~/.local/share/isemotalk-node-env.sh
    npm run remote:api-preview

This only starts Node Express + persistent SQLite at 127.0.0.1:3101. It never loads model weights or mock seeds. It deliberately does not resume queued calls, upload new audio, retry jobs, or execute QA model inference while the single GPU trains. Those endpoints respond 503 with explicit preview-mode explanation. Existing case CRUD, review reading, database and web screens remain available.

Stop this API-only process with Ctrl+C before starting the full remote:server supervisor after training. Never kill the preexisting application on shared FTISU port 3001.

## C. Windows: frontend only, via localhost SSH tunnel

PowerShell terminal A (replace ftisu-ser with the SSH alias/hostname you actually use, if different):

    ssh -N -L 127.0.0.1:13001:127.0.0.1:3101 ftisu-ser

### Alternative: VS Code Remote SSH port forwarding (no separate ssh -L command)

In the VS Code **remote** window connected to FTISU, keep the API-only terminal running at 127.0.0.1:3101. Open the bottom **PORTS** panel, choose **Forward a Port** and enter the **remote** port 3101. Right-click the forwarded port and choose **Change Local Address Port** = 13001. Visibility should remain Private/local. Test from the Windows laptop browser:

    http://127.0.0.1:13001/api/system/status

Expected: JSON with api="ok", inference.reachable=false while CUDA training or API-only preview is active. If VS Code assigns a different LOCAL port, use it as -LocalPort in the launcher below. DO NOT run SSH -L and VS Code forwarding simultaneously on the same local port.

Once Windows has the correct branch and dependencies, run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-vscode-preview.ps1 -LocalPort 13001

This checks forwarded FTISU API, builds React frontend locally, then launches ONLY remote:web:preview. No local Express, FastAPI, SQLite or model starts. Open http://127.0.0.1:5173. Do not run this in the FTISU SSH terminal.

PowerShell terminal B (laptop project checkout):

    cd C:\Users\Legion\Documents\1203_KLTN
    git status --short
    git fetch origin
    git switch feat/remote-gpu-full-pipeline-20261123
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\repair-node-local.ps1 -CheckOnly
    npm run build
    npm run remote:web:preview

IMPORTANT: if git status shows uncommitted files, do not force-switch/discard them. Windows C: previously had ~3GB free; npm ci previously hit EPERM on locked esbuild.exe. Use the existing read-only dependency check before any repair and stop the old Vite processes before reinstalling packages. Do not delete the database, research models or audio.

The preview command serves frontend at 127.0.0.1:5173 and proxies /api via 13001 over SSH. It intentionally does not claim ASR/SER/QA real-model readiness. Browser status and errors still show unavailable inference.

## Assistant-owned source code

- Real QA classifier, pretrained/dataset revisions and held-out synthetic classification metrics
- Python FastAPI model adapter, service readiness, provenance, nonmock evidence
- Express QA API GET/POST, transcript SHA stale-guard, safe training preview gate
- SQLite schema v3, FK cascade, migration tests, persisted model hashes
- React QA advice card distinct from paper SER four-class emotion review
- Linux/Windows launchers, CI and end-to-end acceptance scripts, final research documentation

## After GPU training finishes

1. Inspect true training_result.json and log. Do not invent metrics.
2. Stop API-only preview with Ctrl+C; do not run it alongside full server on port 3101.
3. Configure private F4 + PhoWhisper research-serving assets and verify held-out examples. Never push research checkpoint or user audio to public Git.
4. Run npm run remote:preflight and npm run remote:server on FTISU.
5. In another SSH terminal, run npm run remote:check and npm run remote:qa-smoke, then real audio smoke with npm run remote:smoke -- /absolute/path/to/permitted.wav.
6. On Windows stop preview and run npm run remote:web (STRICT mode, requires trained QA + genuinely verified SER and real ASR). Do not substitute mock outputs to pass acceptance.

OneVoice is AI-generated and CC BY-NC-SA 4.0. Its needs_attention labels are synthetic business labels, not human-confirmed customer-service outcomes. Report all domain-shift limitations in the thesis.
