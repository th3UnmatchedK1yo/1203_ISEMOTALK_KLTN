#!/usr/bin/env bash
# Group GPU host only. Prepare real PhoWhisper/F4 private assets and verification.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/inference/.venv/bin/python"
SERVING="$HOME/services/isemotalk-ser-serving"
ASSETS="$HOME/services/isemotalk-private"
INVENTORY="$ASSETS/pinned_models.json"
PACKAGE="$ASSETS/f4-m1-seed13"
HEAD="$ASSETS/head-m1-seed13"
[[ -x "$PY" ]] || { echo "Run bash scripts/bootstrap-gpu-host.sh --with-ml first." >&2; exit 2; }
"$PY" -c 'import torch; assert torch.cuda.is_available(), "CUDA required, no CPU fallback"'
mkdir -p "$ASSETS" "$PACKAGE" "$HEAD"

if [[ ! -f "$SERVING/src/serq1/serving/f4_factory.py" ]]; then
  source_url=""
  if [[ -d "$HOME/SER_VI_TRANSFER/.git" ]]; then
    source_url="$(git -C "$HOME/SER_VI_TRANSFER" remote get-url origin)"
  elif [[ -n "${ISEMO_PRIVATE_SER_REMOTE:-}" ]]; then
    source_url="$ISEMO_PRIVATE_SER_REMOTE"
  else
    echo "Private research checkout missing. Set ISEMO_PRIVATE_SER_REMOTE to an authorized private Git remote." >&2
    exit 3
  fi
  echo "[stage] Cloning private research serving source to a SEPARATE checkout"
  GIT_TERMINAL_PROMPT=0 git clone --single-branch \
    --branch feat/isemotalk-private-serving-20261123 "$source_url" "$SERVING" ||
    { echo "Private Git access failed. Don't copy private assets to public repo." >&2; exit 3; }
fi

if [[ ! -f "$INVENTORY" ]]; then
  echo "[stage] Downloading/reusing PINNED public encoders and PhoWhisper"
  emo="$HOME/SER_VI_TRANSFER/models/emotion2vec_base"
  if [[ -f "$emo/emotion2vec_base.pt" ]]; then
    "$PY" "$SERVING/scripts/stage_isemotalk_models.py" \
      --output "$INVENTORY" --existing-emotion2vec-dir "$emo"
  else
    "$PY" "$SERVING/scripts/stage_isemotalk_models.py" --output "$INVENTORY"
  fi
fi

if [[ ! -s "$HEAD/model.pt" || ! -s "$HEAD/metadata.json" ]]; then
  match=""
  for root in "$HOME/SER_VI_TRANSFER/.worktrees" "$HOME/SER_VI_TRANSFER/artifacts" "$HOME/services/isemotalk-ser-serving/artifacts"; do
    [[ -d "$root" ]] || continue
    match="$(find "$root" -maxdepth 14 -type f -path '*/CONDITIONS/M1/seed_13/model.pt' -print -quit 2>/dev/null || true)"
    [[ -n "$match" ]] && break
  done
  if [[ -n "$match" && -f "$(dirname "$match")/metadata.json" ]]; then
    cp -- "$match" "$HEAD/model.pt"
    cp -- "$(dirname "$match")/metadata.json" "$HEAD/metadata.json"
  else
    archive="$HOME/Downloads/SER_WORKTREE_RESULTS_20261007.tar.gz"
    if [[ -f "$archive" ]]; then
      model_member="$(tar -tzf "$archive" | grep '/CONDITIONS/M1/seed_13/model.pt$' | head -1 || true)"
      meta_member="$(tar -tzf "$archive" | grep '/CONDITIONS/M1/seed_13/metadata.json$' | head -1 || true)"
      if [[ -n "$model_member" && -n "$meta_member" ]]; then
        tar -xOzf "$archive" "$model_member" > "$HEAD/model.pt"
        tar -xOzf "$archive" "$meta_member" > "$HEAD/metadata.json"
      fi
    fi
  fi
fi
if [[ ! -s "$HEAD/model.pt" || ! -s "$HEAD/metadata.json" ]]; then
  echo "MISSING HISTORICAL HEAD: $HEAD/model.pt + metadata.json" >&2
  echo "Only this M1/seed13 checkpoint pair is needed; do NOT retrain all seeds." >&2
  echo "Copy the two original files from historical backup or place archive in ~/Downloads on the server." >&2
  exit 3
fi

if [[ ! -f "$PACKAGE/ser_config.json" ]]; then
  emo_dir="$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1]))["emotion2vec_dir"])' "$INVENTORY")"
  text_dir="$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1]))["phobert_dir"])' "$INVENTORY")"
  PYTHONPATH="$SERVING" "$PY" "$SERVING/scripts/prepare_isemotalk_f4.py" \
    --research-root "$SERVING" --weights "$HEAD/model.pt" \
    --metadata "$HEAD/metadata.json" --emotion2vec-dir "$emo_dir" \
    --phobert-dir "$text_dir" --output "$PACKAGE/ser_config.json"
fi

ENV_FILE="$ROOT/inference/.env"
[[ ! -f "$ENV_FILE" ]] || cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d_%H%M%S)"
cat > "$ENV_FILE" <<EOF
ISEMO_MODE=real
ISEMO_ASR=phowhisper
ISEMO_ASR_MODEL=vinai/PhoWhisper-base
ISEMO_ASR_REVISION=7ebdb9e88f5cc5271fb88f4d642c82ff9388650e
ISEMO_ASR_DEVICE=cuda
ISEMO_SER=checkpoint
ISEMO_SER_FACTORY=src.serq1.serving.f4_factory:build_model
ISEMO_SER_CONFIG=$PACKAGE/ser_config.json
ISEMO_ALLOW_UNVERIFIED=0
ISEMO_DIARIZATION=none
ISEMO_QA_MODEL_DIR=$HOME/services/isemotalk-private/models/qa-xlm-r-seed2026-v1
ISEMO_DATA_DIR=$HOME/services/isemotalk-data
ISEMO_UPLOADS_DIR=$HOME/services/isemotalk-data/uploads
EOF
chmod 600 "$ENV_FILE"
mkdir -p "$HOME/services/isemotalk-data/uploads"
echo "[stage] Full private package configured; no mock ASR or SER."

REG="$HOME/SER_VI_TRANSFER/artifacts/serq1/registry.csv"
TXT="$HOME/SER_VI_TRANSFER/artifacts/asr/serq1_v2/phowhisper_vnemos/transcripts.csv"
EVAL="$PACKAGE/vnemos_sanity.jsonl"
if [[ -f "$REG" && -f "$TXT" && ! -f "$EVAL" ]]; then
  "$PY" "$SERVING/scripts/prepare_isemotalk_vnemos_eval.py" \
    --registry "$REG" --vnemos-asr "$TXT" --per-class 12 --output "$EVAL"
fi
if [[ -f "$EVAL" ]]; then
  echo "[stage] Verifying real CUDA F4 on external VNEMOS data (not call center QA)"
  (cd "$ROOT/inference"; PYTHONPATH="$SERVING:$ROOT/inference" \
    "$PY" -m app.verify --manifest "$EVAL" --min-macro-f1 0.35)
else
  echo "EVALUATION DATA ABSENT: keep SER unverified. Need VNEMOS registry and original pinned ASR transcript."
  echo "Do not enable unverified bypass just to make UI green."
fi
echo "[stage] Private package: $PACKAGE/ser_config.json"
echo "[stage] Final acceptance still requires remote:smoke with a permitted WAV."
