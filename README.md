# ISEmoTalk

Local research prototype for Vietnamese speech emotion recognition and conversation screening. It is not a production contact-center system, an employee scoring tool, or a validated emotion detector for arbitrary real calls.

## Workflow
Dashboard → Import audio → ASR / speaker metadata / SER → Review queue → Listen to flagged segments → Save QA decisions → Reports.
Every call shows its provenance (mock, imported, real). Real refers to the inference adapter, not proof of model accuracy. QA confirmation rate is not benchmark accuracy.

## Run locally (Windows PowerShell)
- Node.js 22, Python 3.10/3.11, FFmpeg and FFprobe on PATH.
- Run `npm ci` at the repository root.
- Create the Python environment: `py -3.11 -m venv inference/.venv`.
- Install base dependencies: `inference/.venv/Scripts/python -m pip install fastapi uvicorn numpy pydantic`.
- Start three services in separate terminals:
  - `npm run dev:api`
  - `npm run dev:inference`
  - `npm run dev:web`
- Open the URL printed by Vite (typically http://localhost:5173).
- The API listens on 127.0.0.1:3001; inference on 127.0.0.1:8001. Vite proxies /api.
- Default inference is MOCK. Use only for testing plumbing and explicitly opt in on the import page.

## Real SER integration (required before scientific demo)
The trained checkpoints and serving factory are not included. Do not substitute a random head or a different model and call it the paper model.
Create local inference/.env (never commit credentials/checkpoints/private recordings):
```
ISEMO_MODE=real
ISEMO_ASR=phowhisper
ISEMO_ASR_DEVICE=auto
ISEMO_DIARIZATION=none
ISEMO_SER=checkpoint
ISEMO_SER_FACTORY=your_serving_module:build_model
ISEMO_SER_CONFIG=C:/local/research/ser_config.json
ISEMO_ALLOW_UNVERIFIED=0
```
Install torch (appropriate CUDA build), transformers and the exact dependencies of the training code in the Python environment. Match preprocessing, model architecture, label order and feature lineage to the checkpoint.
See inference/app/adapters/ser_checkpoint.py for the factory contract. Run `python -m app.verify --manifest <held-out.jsonl> --min-macro-f1 <predeclared threshold>` from inference/ with the virtual environment active. Verify on an independent four-class set and reproduce the corresponding experimental protocol; a local verification file is not evidence of domain generalization.
Restart inference after changes. Check the status panel and run actual recordings.

## Scientific limitations
- Top-1 scores are not calibrated confidence; 0.55 is an initial review heuristic, not a scientifically validated threshold.
- Modality disagreement does not imply actual emotional contradiction.
- Unknown speakers are not treated as a single customer trajectory.
- No real-world deployment claims until independently labeled conversation data and ranking metrics have been evaluated.
- Current storage retains top-1 scores, not complete probability vectors. Full-vector reliability analysis is future work.
- Local prototype only; authentication, production authorization, retention and privacy controls are not implemented. Use only recordings you are authorized to process. Local data lives in server/data.

## Verification commands
```
npm run build
npm run typecheck:server
npm test
```
Manually verify: import multiple files, observe ASR/SER progress, open actual audio, seek to a segment, change QA decision, save and reload, filter by provenance, verify missing IDs return an error, and check CSV export.
