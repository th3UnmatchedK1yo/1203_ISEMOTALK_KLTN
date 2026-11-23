#!/usr/bin/env bash
# Download three public datasets concurrently (CPU/network only, no GPU).
# Jobs survive SSH/VS Code terminal closure; log files remain in private area.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRIVATE="$HOME/services/isemotalk-private"
VENV="$PRIVATE/.venv-data"
LOGS="$PRIVATE/logs/datasets"
mkdir -p "$LOGS"
cd "$ROOT"
if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV" || { echo "Python venv unavailable. Do not edit system Python."; exit 2; }
fi
echo "[datasets] Installing CPU-only data tools into an isolated environment."
"$VENV/bin/python" -m pip install --disable-pip-version-check -q --upgrade "huggingface_hub>=0.31" "pyarrow>=19,<30"

# 3.42GB OneVoice + FLEURS ~0.7GB + FOSD ~0.4GB + HF caches.
free_kb="$(df -Pk "$PRIVATE" | awk 'NR==2 {print $4}')"
if [[ -z "$free_kb" || "$free_kb" -lt 12582912 ]]; then
  echo "ERROR: at least 12 GiB free disk required to safely download sources + caches." >&2
  exit 3
fi

run_job() {
  local name="$1"
  shift
  local file="$LOGS/$name.log"
  local pidfile="$LOGS/$name.pid"
  if [[ -f "$pidfile" ]]; then
    local old
    old="$(cat "$pidfile")"
    if [[ "$old" =~ ^[0-9]+$ ]] && kill -0 "$old" 2>/dev/null; then
      echo "[datasets] $name already running pid=$old, log=$file"
      return
    fi
  fi
  echo "[datasets] Starting $name -> $file"
  nohup "$VENV/bin/python" -u "$@" > "$file" 2>&1 </dev/null &
  echo "$!" > "$pidfile"
  echo "[datasets] $name pid=$!"
}

run_job onevoice-all "$ROOT/inference/scripts/download_onevoice.py" \
  --output "$PRIVATE/datasets/onevoice" --all-audio

run_job fleurs-vi-test "$ROOT/inference/scripts/download_asr_benchmarks.py" \
  --dataset fleurs-vi-test --output "$PRIVATE/datasets/fleurs-vi-test" --limit 120

run_job fpt-fosd-sample "$ROOT/inference/scripts/download_asr_benchmarks.py" \
  --dataset fpt-fosd-sample --output "$PRIVATE/datasets/fpt-fosd-sample" --limit 100

echo "[datasets] 3 CPU/network jobs started. GPU remains available for independent train runs."
echo "[datasets] Monitor: tail -n 10 $LOGS/*.log"
echo "[datasets] If a job fails, review log and rerun after its PID is no longer active."
echo "[datasets] OneVoice is synthetic. FLEURS is an ASR test, FOSD train an ASR diagnostic."
