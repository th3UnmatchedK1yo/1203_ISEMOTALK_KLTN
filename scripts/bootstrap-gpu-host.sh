#!/usr/bin/env bash
# No-sudo, non-destructive setup for the GROUP GPU server.
# Training mode: --with-ml; later F4 research components: --with-f4
# Does NOT change training venvs, open ports, or start services.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ "$(uname -s)" != Linux ]]; then echo "ERROR: Linux server only." >&2; exit 2; fi
if [[ "$(uname -m)" != x86_64 ]]; then echo "ERROR: Unsupported architecture. Verify Node binary manually." >&2; exit 2; fi

VERSION="v22.17.1"
INSTALL="$HOME/.local/opt/node-$VERSION-linux-x64"
BIN_DIR="$INSTALL/bin"
TARBALL="node-$VERSION-linux-x64.tar.xz"
NODE_SHA="ff04bc7c3ed7699ceb708dbaaf3580d899ff8bf67f17114f979e83aa74fc5a49"
mkdir -p "$HOME/.local/opt"
if [[ ! -x "$BIN_DIR/node" ]]; then
  command -v curl >/dev/null || { echo "ERROR: curl required." >&2; exit 2; }
  command -v sha256sum >/dev/null || { echo "ERROR: sha256sum required." >&2; exit 2; }
  TEMP="$(mktemp -d)"
  trap 'rm -rf "$TEMP"' EXIT
  echo "[setup] Fetching pinned official Node $VERSION (user directory; no sudo)"
  curl -fLSs --retry 3 --connect-timeout 20 \
    "https://nodejs.org/download/release/$VERSION/$TARBALL" -o "$TEMP/$TARBALL"
  printf '%s  %s\n' "$NODE_SHA" "$TEMP/$TARBALL" | sha256sum -c -
  tar -xJf "$TEMP/$TARBALL" -C "$HOME/.local/opt"
  trap - EXIT
  rm -rf "$TEMP"
fi
export PATH="$BIN_DIR:$PATH"
echo "[setup] node=$(node --version) npm=$(npm --version)"
# Explicit local env, not an unreviewed edit of ~/.profile.
mkdir -p "$HOME/.local/share"
printf 'export PATH="%s:$PATH"\n' "$BIN_DIR" > "$HOME/.local/share/isemotalk-node-env.sh"
echo "[setup] Installing web/backend JavaScript dependencies in THIS checkout"
npm ci --no-audit --no-fund
npm run typecheck:server
echo "[setup] JS dependencies and backend typecheck OK"
if [[ $# -eq 0 || ( "$1" != "--with-ml" && "$1" != "--with-f4" ) ]]; then
  echo "[setup] Node ready. For isolated CUDA serving Python: bash scripts/bootstrap-gpu-host.sh --with-ml"
  exit 0
fi

echo "[setup] Isolated serving Python venv - no modifications to research training venv"
PYTHON="$(command -v python3)"
if [[ ! -x inference/.venv/bin/python ]]; then
  "$PYTHON" -m venv inference/.venv || {
    echo "ERROR: python3 -m venv unavailable. Check user-level Python/uv. Do not sudo modify training env." >&2
    exit 2
  }
fi
PY="$ROOT/inference/.venv/bin/python"
"$PY" -m pip install --no-cache-dir --upgrade pip
"$PY" -m pip install --no-cache-dir -r inference/requirements-core.txt
# Research feature extractor pins. Official TorchAudio 2.11.1 has stable ABI
# and supports PyTorch 2.11+ (incl 2.15) on Python 3.14. DO NOT pin 2.15.
"$PY" -m pip install --no-cache-dir 'torch==2.15.0' 'torchaudio==2.11.1'
# CUDA text QA training can succeed without optional FunASR/ModelScope.
"$PY" -m pip install --no-cache-dir \
  'transformers==5.15.0' 'accelerate>=1.0' 'scikit-learn>=1.4' \
  'sentencepiece>=0.2' 'soundfile>=0.12' 'safetensors>=0.4' 'huggingface_hub>=0.30'
if [[ "$1" == "--with-f4" ]]; then
  echo "[setup] Installing original SER extractor optional dependencies"
  "$PY" -m pip install --no-cache-dir 'funasr==1.4.2' 'modelscope==1.39.1'
fi
"$PY" -m pip check
"$PY" - <<'PY'
import torch
from importlib.metadata import version
print("[setup] serving Python PyTorch:", torch.__version__)
for name in ("transformers","funasr","modelscope"):
    print("[setup]", name, version(name))
if not torch.cuda.is_available():
    raise SystemExit("ERROR: serving venv cannot see CUDA; NO CPU fallback.")
print("[setup] CUDA:", torch.cuda.get_device_name(0))
PY
echo "[setup] GPU runtime ready. Next: private F4 package + held-out verification + real-audio smoke."
echo "[setup] NOT YET a trained/verified model deployment."
