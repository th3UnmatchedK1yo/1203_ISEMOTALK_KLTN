# Call center QA - CUDA training & GPU web deployment (2026-11-23)

ISEmoTalk has three distinct machine-learning roles:
- PhoWhisper-base ASR converts Vietnamese speech to text.
- Original paper F4 SER (emotion2vec + PhoBERT + CrossAttentionFusion) predicts four vocal emotions.
- Independently trained XLM-RoBERTa model predicts call-level needs_attention. Its data is synthetic OneVoice, not customer-call ground truth.

## What failed
The old script incorrectly specified torchaudio==2.15.0, which does not exist. The official torchaudio==2.11.1 uses the stable ABI and supports torch 2.11+ including 2.15, Python up to 3.14. The new setup uses torch==2.15.0 and torchaudio==2.11.1 in inference/.venv only. Research venv stays unchanged.

## GPU server: Phase A - train a new, genuine QA attention model NOW

Open an SSH terminal on FTISU:

    cd ~/services/isemotalk
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    bash scripts/bootstrap-gpu-host.sh --with-ml
    bash scripts/train-callcenter-qa.sh

The one-command trainer pins OneVoice source commit, downloads metadata and first 24 synthetic WAVs to private ~/services/isemotalk-private, and fine-tunes FacebookAI/xlm-roberta-base on CUDA:0 (2 epochs, 8 batch, 256 tokens). Checkpoints and training report are outside the public repository:
- ~/services/isemotalk-private/models/qa-xlm-r-seed2026-v1
- ~/services/isemotalk-private/logs/qa-xlm-r-seed2026-v1.log

Data: https://huggingface.co/datasets/nhatminh/OneVoice
Source attribution: nhatminh/OneVoice, CC BY-NC-SA 4.0. Research/non-commercial only, respect sharing restrictions.
OneVoice contains 1200 AI-generated Vietnamese call-center recordings, not real human interactions. Each metadata row has transcript, binary needs_attention and speaker information. Do not confuse needs_attention with any four-class SER emotion label. No source voice-cloning reference clips are downloaded.

Split: customer_voice_id-grouped, one unseen voice group for validation and one for test. Speaker overlap between split groups is rejected. Remaining agent/template overlap may still cause optimistic scores. Macro F1, per-class F1, confusion, Precision@25, Recall@25 are reported on the held-out synthetic split, not real call-center QA.

## GPU server: Phase B - original F4 research model

Only after Phase A successfully writes training_result.json:

    bash scripts/bootstrap-gpu-host.sh --with-f4
    bash scripts/stage-gpu-models.sh

This uses a separate PRIVATE research serving checkout, hashes original emotion2vec, PhoBERT, H5 M1 seed13 F4 weights and factory source, loads pinned PhoWhisper-base ASR, and verifies an outside-training VNEMOS four-class sample if the original authorized files exist. It does not retrain nine historical heads. If the head/metadata or dataset is missing, stage stops and requires authentic files. Do not fake metrics or bypass verification.

## GPU server: Phase C - service and full end-to-end smoke

In terminal one:

    source ~/.local/share/isemotalk-node-env.sh
    npm run remote:preflight
    npm run remote:server

In terminal two:

    cd ~/services/isemotalk
    source ~/.local/share/isemotalk-node-env.sh
    npm run remote:check
    npm run remote:qa-smoke

For an audio smoke test, get one fully qualified WAV file:

    find ~/services/isemotalk-private/datasets/onevoice/audio -type f -name '*.wav' | head -1

Pass that filename to npm run remote:smoke -- /absolute/path.wav. The smoke creates one real persisted SQLite call in the GPU host, validates ASR and SER stages, and protects against mock stage evidence. UI also has a separate QA attention card for running real trained QA classifier and saving score/model SHA256 to the v3 database.

## Laptop: web only

PowerShell terminal for tunnel:

    ssh -N -L 127.0.0.1:13001:127.0.0.1:3101 ftisu-ser

Another PowerShell:

    git fetch origin
    git switch feat/remote-gpu-full-pipeline-20261123
    git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
    npm ci
    npm run build
    npm run remote:web

The browser stays on http://127.0.0.1:5173. API, recordings, SQLite and three real ML components run on FTISU. Existing server port 3001 is not touched. No VPS is needed to demo over SSH.

## Scientific honesty and pending acceptance

- Synthetic OneVoice QA labels are NOT human QA ground truth. Do not claim real call-center gains.
- Dataset original transcripts vs PhoWhisper transcripts cause a domain/noise gap. Benchmark separately.
- Long conversations may be truncated at 256 tokens; the interface marks this.
- F4 paper model is an emotion classifier, separate from needs_attention and from human case resolution.
- Need full GPU smoke and preserved logs; code/CI alone cannot prove training happened on remote.
- To evaluate business effectiveness, compare random, keyword, XLM-R, SER-assisted ranking on legitimate held-out QA labels.
- Preserve the original training env, all old artifacts and existing server apps. No sudo or deleting databases, no CPU training fallback.

Stop at the first failed command; send the error and final 30-40 lines without credentials, dataset recordings or other private assets.
