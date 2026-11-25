#!/usr/bin/env bash
# Safe copy, never sync/delete or overwrite. Default is dry run.
set -euo pipefail
if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 RCLONE_REMOTE:SOURCE_FOLDER PRIVATE_RAW_DIR [--execute]" >&2
  exit 2
fi
remote="$1"
target="$2"
mode="${3:---dry-run}"
[[ "$remote" == *:* && "$remote" != *$'\n'* ]] || { echo "Explicit configured rclone remote required" >&2; exit 2; }
[[ "$mode" == "--execute" || "$mode" == "--dry-run" ]] || exit 2
command -v rclone >/dev/null
repo="$(cd "$(dirname "$0")/.." && pwd -P)"
target="$(realpath -m "$target")"
[[ "$target" != "$repo" && "$target" != "$repo/"* ]] || { echo "Raw data must be outside Git" >&2; exit 2; }
umask 077
if [[ "$mode" == "--execute" ]]; then mkdir -p "$target"; fi

copy_one() {
  local src="$1" dst="$2"
  if [[ "$mode" == "--dry-run" ]]; then
    rclone copy "$src" "$dst" --immutable --dry-run --transfers 4 --checkers 8
  else
    mkdir -p "$dst"
    rclone copy "$src" "$dst" --immutable --transfers 4 --checkers 8 --progress
    rclone check "$src" "$dst" --one-way
  fi
}

if [[ "$remote" == *":SER_BACKUP_20260928" ]]; then
  for name in VISEC VI_FINAL_TRAINING_20260913_144031 VNEMOS IEMOCAP; do
    copy_one "$remote/$name" "$target/$name"
  done
else
  source_name="${remote##*/}"
  copy_one "$remote" "$target/$source_name"
fi
echo "Restore stage finished in $mode; run corpus audit before training."
