#!/usr/bin/env python3
"""Cache ONLY the pinned PhoWhisper-base assets for a genuine ASR MVP.

Separate from private F4 staging. No model training, no dataset downloads,
no changes to source recordings, checkpoints or SQLite. Explicit network
work happens only when this CLI is called.
"""
from __future__ import annotations

import shutil
from pathlib import Path

ASR_ID = "vinai/PhoWhisper-base"
ASR_REV = "7ebdb9e88f5cc5271fb88f4d642c82ff9388650e"


def main() -> None:
    from huggingface_hub import snapshot_download
    cache = Path.home() / ".cache/huggingface"
    cache.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(cache).free
    if free < 3 * 1024**3:
        raise SystemExit("Need at least 3 GiB free on Hugging Face cache volume. Nothing was downloaded.")
    result = Path(snapshot_download(repo_id=ASR_ID, revision=ASR_REV))
    if result.name != ASR_REV:
        raise SystemExit("Downloaded snapshot is not at the requested immutable revision.")
    if not (result / "config.json").exists():
        raise SystemExit("Pinned ASR config missing after download.")
    if not any((result / w).exists() for w in ("model.safetensors", "pytorch_model.bin", "model.safetensors.index.json", "pytorch_model.bin.index.json")):
        raise SystemExit("Pinned ASR weights missing after download.")
    print(f"ASR cached: {ASR_ID}@{ASR_REV}")
    print(f"Snapshot: {result}")
    print("No ASR inference, WER benchmark, or SER/QA evaluation performed.")


if __name__ == "__main__":
    main()
