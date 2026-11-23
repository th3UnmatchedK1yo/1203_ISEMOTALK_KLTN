#!/usr/bin/env python3
"""Stage a stronger, immutable PhoWhisper model on FTISU, without touching QA/SER.

Run in the existing FTISU inference venv:
  python inference/scripts/stage_phowhisper_upgrade.py --size medium

The source is a real Hugging Face model at a pinned Git commit. Files remain
in the HF model cache. A small private selection manifest makes the API
serve the chosen model after a deliberate restart of the ISEmoTalk runtime.
This command never starts inference, stops GPU training, overwrites a prior
checkpoint, or modifies the SQLite customer-call database.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

MODELS = {
    "medium": ("vinai/PhoWhisper-medium", 8),
    "large": ("vinai/PhoWhisper-large", 12),
}
SELECTION = Path.home() / ".local" / "share" / "isemotalk-asr" / "selected.json"


def validate_selection(value: object) -> tuple[str, str]:
    if not isinstance(value, dict):
        raise ValueError("ASR selection must be a JSON object.")
    model, rev = value.get("model_id"), value.get("revision")
    if model not in [entry[0] for entry in MODELS.values()]:
        raise ValueError("ASR selection must be an approved PhoWhisper medium/large ID.")
    if not isinstance(rev, str) or len(rev) != 40 or any(c not in "0123456789abcdef" for c in rev):
        raise ValueError("ASR selection requires an immutable 40-digit Git revision.")
    return model, rev


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--size", choices=sorted(MODELS), default="medium")
    args = parser.parse_args()
    model_id, reserve_gib = MODELS[args.size]
    cache = Path.home() / ".cache" / "huggingface"
    cache.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(cache).free
    if free < reserve_gib * 1024 ** 3:
        raise SystemExit(
            f"Need >= {reserve_gib} GiB free at {cache}, currently {free / (1024 ** 3):.1f} GiB. "
            "Nothing downloaded or removed."
        )

    from huggingface_hub import HfApi, snapshot_download
    info = HfApi().model_info(model_id)
    revision = info.sha
    validate_selection({"model_id": model_id, "revision": revision})
    print(f"[asr-stage] Downloading {model_id}@{revision}; original model cache is preserved.")
    snapshot = Path(snapshot_download(repo_id=model_id, revision=revision)).resolve()
    if snapshot.name != revision or not (snapshot / "config.json").is_file():
        raise SystemExit("Resolved model snapshot is not the pinned complete configuration.")
    if not any((snapshot / name).exists() for name in (
        "model.safetensors", "pytorch_model.bin",
        "model.safetensors.index.json", "pytorch_model.bin.index.json",
    )):
        raise SystemExit("Downloaded snapshot has no model weights.")

    data = {"model_id": model_id, "revision": revision, "cache_snapshot": str(snapshot)}
    validate_selection(data)
    SELECTION.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temp = SELECTION.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    os.chmod(temp, 0o600)
    temp.replace(SELECTION)
    print("[asr-stage] Staged:", model_id, "@", revision)
    print("[asr-stage] Selection:", SELECTION)
    print("[asr-stage] Restart only the ISEmoTalk FTISU runtime to use the new ASR.")
    print("[asr-stage] No quality score, SER model, evaluation, or transcript has been changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
