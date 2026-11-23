#!/usr/bin/env bash
# Run genuine XLM-R QA replications SEQUENTIALLY on one NVIDIA GPU.
# Can execute at same time as CPU-only dataset downloads / browser preview.
# No concurrent GPU jobs, no CPU fallback, no overwrite of first seed results.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/inference/.venv/bin/python"
PRIVATE="$HOME/services/isemotalk-private"
DATA="$PRIVATE/datasets/onevoice"
LOGS="$PRIVATE/logs/experiments"
mkdir -p "$LOGS"
cd "$ROOT"
[[ -x "$PY" ]] || { echo "Missing ML venv."; exit 2; }
"$PY" - <<'PY'
import torch
if not torch.cuda.is_available():
    raise SystemExit("CUDA required; refusing CPU training")
print("[qa-exp] NVIDIA:",torch.cuda.get_device_name(0),"Torch:",torch.__version__)
PY
[[ -s "$DATA/records.jsonl" && -s "$DATA/source_manifest.json" ]] || {
  echo "OneVoice metadata missing. First run scripts/train-callcenter-qa.sh."; exit 2;
}

run_one() {
  local seed="$1"
  local dest="$PRIVATE/models/qa-xlm-r-seed$seed-v1"
  local logfile="$LOGS/qa-seed$seed.log"
  if [[ -s "$dest/training_result.json" && -s "$dest/model.safetensors" ]]; then
    echo "[qa-exp] seed=$seed COMPLETE, preserving existing checkpoint"
  elif [[ -e "$dest/training_result.json" || -e "$dest/model.safetensors" ]]; then
    echo "PARTIAL checkpoint seed=$seed at $dest. Do not overwrite; inspect it." >&2
    exit 4
  else
    echo "[qa-exp] CUDA training seed=$seed (new grouped customer holdout)"
    "$PY" -u inference/scripts/train_onevoice_qa.py \
      --dataset "$DATA" --out "$dest" --seed "$seed" \
      --epochs 2 --batch-size 8 --max-length 256 \
      2>&1 | tee "$logfile"
  fi
  local baseline="$LOGS/baselines-seed$seed.json"
  if [[ ! -e "$baseline" ]]; then
    "$PY" inference/scripts/eval_onevoice_baselines.py \
      --dataset "$DATA" --model-report "$dest/training_result.json" \
      --output "$baseline" | tee -a "$logfile"
  fi
}

# Existing seed2026 was trained separately; its heldout test must remain unchanged.
first="$PRIVATE/models/qa-xlm-r-seed2026-v1/training_result.json"
if [[ -s "$first" ]]; then
  base="$LOGS/baselines-seed2026.json"
  if [[ ! -e "$base" ]]; then
    "$PY" inference/scripts/eval_onevoice_baselines.py \
      --dataset "$DATA" --model-report "$first" --output "$base"
  fi
fi

# TWO further genuine GPU fine-tunes, sequential, to report split sensitivity.
run_one 2027
run_one 2028
echo "[qa-exp] DONE, results at $LOGS; no extra GPU job running."
echo "[qa-exp] These are synthetic call-center QA experiments, not human-confirmed live QA."
