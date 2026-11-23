#!/usr/bin/env bash
# Read-only FTISU status check for GPU, background datasets, QA runs and API.
set -u
BASE="$HOME/services/isemotalk-private"
echo "===== GPU (does not train) ====="
nvidia-smi --query-gpu=name,memory.used,memory.free,utilization.gpu --format=csv,noheader 2>&1 || true
echo
echo "===== DOWNLOAD JOBS ====="
for name in onevoice-all fleurs-vi-test fpt-fosd-sample; do
  pidfile="$BASE/logs/datasets/$name.pid"
  logfile="$BASE/logs/datasets/$name.log"
  if [[ -r "$pidfile" ]]; then
    pid="$(cat "$pidfile")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$name: running pid=$pid"
    else
      echo "$name: not running (completed or failed - read log)"
    fi
  else
    echo "$name: not launched"
  fi
  if [[ -r "$logfile" ]]; then tail -n 2 "$logfile"; fi
done
echo
echo "===== QA TRAINING RESULTS ====="
for seed in 2026 2027 2028; do
  report="$BASE/models/qa-xlm-r-seed$seed-v1/training_result.json"
  if [[ -f "$report" ]]; then
    echo "seed $seed complete:"
    "$HOME/services/isemotalk/inference/.venv/bin/python" -c 'import json,sys; x=json.load(open(sys.argv[1])); print("  test macro-F1",x["test_metrics"]["macro_f1"],"P@K",x["test_metrics"]["precision_at_k"])' "$report"
  else
    echo "seed $seed: no completed report"
  fi
done
echo
echo "===== QA REPLICATION RUNNER ====="
runner="$BASE/logs/experiments/runner.log"
if [[ -r "$runner" ]]; then
  tail -n 14 "$runner"
else
  echo "No runner.log found (not started or redirected elsewhere)."
fi
echo
echo "===== QA BASELINE REPORTS ====="
for seed in 2026 2027 2028; do
  baseline="$BASE/logs/experiments/baselines-seed$seed.json"
  if [[ -s "$baseline" ]]; then
    echo "seed $seed: baseline report present ($baseline)"
  else
    echo "seed $seed: baseline not yet available"
  fi
done
echo
echo "===== REMOTE API PREVIEW ====="
curl -sS --max-time 2 -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3101/api/system/status || true
echo
echo "===== PRIVATE ARTIFACT SIZE ====="
du -sh "$BASE/datasets" "$BASE/models" 2>/dev/null || true
echo
echo "No processes were started, killed or modified by this status script."
