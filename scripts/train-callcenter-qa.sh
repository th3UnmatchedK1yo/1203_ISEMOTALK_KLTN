#!/usr/bin/env bash
# Real CUDA fine-tune from public OneVoice SYNTHETIC call-center metadata.
# No laptop training, no CPU fallback, no call-center privacy data.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/inference/.venv/bin/python"
BASE="$HOME/services/isemotalk-private"
DATA="$BASE/datasets/onevoice"
MODEL="$BASE/models/qa-xlm-r-seed2026-v1"
LOG="$BASE/logs"
mkdir -p "$DATA" "$MODEL" "$LOG"
[[ -x "$PY" ]] || { echo "ERROR: run bash scripts/bootstrap-gpu-host.sh --with-ml first." >&2; exit 2; }
"$PY" - <<'PY'
import torch
assert torch.cuda.is_available(), "CUDA REQUIRED; refusing CPU training."
print("CUDA TRAINING GPU:", torch.cuda.get_device_name(0), "torch", torch.__version__)
PY
echo "[qa-train] Download metadata + 24 permitted synthetic audio files for audio smoke."
"$PY" "$ROOT/inference/scripts/download_onevoice.py" \
  --output "$DATA" --audio-limit 24
if [[ -f "$MODEL/training_result.json" ]]; then
  echo "[qa-train] Existing finished run preserved: $MODEL/training_result.json"
  echo "[qa-train] To run another experiment, choose a new versioned model output, NEVER overwrite test results."
  exit 0
fi
echo "[qa-train] CUDA fine-tuning XLM-RoBERTa on needs_attention (SYNTHETIC ONLY)"
echo "[qa-train] Training logs: $LOG/qa-xlm-r-seed2026-v1.log"
"$PY" "$ROOT/inference/scripts/train_onevoice_qa.py" \
  --dataset "$DATA" --out "$MODEL" --epochs 2 --batch-size 8 \
  --max-length 256 --seed 2026 2>&1 | tee "$LOG/qa-xlm-r-seed2026-v1.log"
echo "[qa-train] Real model checkpoint: $MODEL"
echo "[qa-train] Synthetic held-out results: $MODEL/training_result.json"
echo "[qa-train] Set ISEMO_QA_MODEL_DIR=$MODEL in inference/.env before GPU service starts."
