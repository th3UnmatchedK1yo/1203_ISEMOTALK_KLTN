#!/usr/bin/env python3
"""Download auditable OneVoice synthetic Vietnamese call-center dataset.

Never use datasets.load_dataset(): the OneVoice repository contains metadata.csv
AND metadata.jsonl at its root, which breaks the generic AudioFolder builder.
Fetch explicit source files by pinned HF commit. No voice cloning references.
Dataset: nhatminh/OneVoice, CC BY-NC-SA 4.0, synthetic, non-commercial only.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path


REPO = "nhatminh/OneVoice"
LICENSE = "cc-by-nc-sa-4.0"


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def parse_binary(raw: object) -> int:
    if isinstance(raw, bool):
        return int(raw)
    if isinstance(raw, int) and raw in (0, 1):
        return raw
    value = str(raw).strip().lower()
    if value in ("true", "1", "yes", "y", "có", "co"):
        return 1
    if value in ("false", "0", "no", "n", "không", "khong"):
        return 0
    raise ValueError(f"Invalid needs_attention label {raw!r}; refusing label guessing.")


def prepare_rows(source: Path) -> list[dict]:
    with source.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows:
        raise ValueError("Empty OneVoice metadata.csv")
    required = {"file_name", "transcript", "needs_attention", "customer_voice_id"}
    if not required.issubset(rows[0]):
        raise ValueError(f"Missing metadata fields {sorted(required - set(rows[0]))}")
    out, seen = [], set()
    for n, row in enumerate(rows, 1):
        audio = str(row["file_name"]).strip()
        text = str(row["transcript"]).strip()
        customer = str(row["customer_voice_id"]).strip()
        if (not audio or audio.startswith("/") or ".." in Path(audio).parts
                or Path(audio).suffix.lower() != ".wav" or not text or not customer):
            raise ValueError(f"Malformed OneVoice row {n}: path/transcript/customer voice.")
        if audio in seen:
            raise ValueError(f"Duplicate audio filename: {audio}")
        seen.add(audio)
        out.append({
            "id": audio, "text": text, "label": parse_binary(row["needs_attention"]),
            "customer_voice_id": customer,
            "employee_id": str(row.get("employee_id") or "").strip(),
            "audio_relpath": audio,
        })
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--output", type=Path, required=True, help="Outside Git checkout")
    ap.add_argument("--audio-limit", type=int, default=0, help="0=metadata only; N=download first N WAVs")
    ap.add_argument("--all-audio", action="store_true", help="Explicitly fetch all 1200 WAVs (multi-GB)")
    args = ap.parse_args()
    if args.audio_limit < 0 or (args.all_audio and args.audio_limit):
        ap.error("Choose --audio-limit N OR --all-audio")
    from huggingface_hub import HfApi, hf_hub_download
    out = args.output.expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    info = HfApi().dataset_info(REPO)
    commit = info.sha
    if not isinstance(commit, str) or len(commit) != 40:
        raise ValueError("Cannot pin immutable OneVoice dataset commit")
    source = Path(hf_hub_download(REPO, "metadata.csv", repo_type="dataset", revision=commit))
    records = prepare_rows(source)
    records_file = out / "records.jsonl"
    manifest_file = out / "source_manifest.json"
    if manifest_file.exists():
        original = json.loads(manifest_file.read_text(encoding="utf-8"))
        if original.get("commit") != commit:
            raise RuntimeError("Dataset remote HEAD changed: keep the existing snapshot, do not mix revisions.")
        if original.get("source_sha256") != sha(source):
            raise RuntimeError("Metadata hash changed since previous download.")
    else:
        if records_file.exists():
            raise RuntimeError("Untracked records.jsonl exists. Refusing overwrite.")
        with records_file.open("x", encoding="utf-8") as stream:
            for row in records:
                stream.write(json.dumps(row, ensure_ascii=False) + "\n")
        manifest = {
            "dataset": REPO, "commit": commit, "license": LICENSE,
            "synthetic": True, "source_file": "metadata.csv",
            "source_sha256": sha(source), "records_sha256": sha(records_file),
            "records": len(records), "label_counts": dict(Counter(r["label"] for r in records)),
            "unique_customer_voices": len({r["customer_voice_id"] for r in records}),
            "note": "Scripted AI-generated recordings; needs_attention is synthetic dataset QA label, NOT human-verified call-center outcome.",
        }
        manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    count = len(records) if args.all_audio else min(args.audio_limit, len(records))
    if count:
        print(f"Downloading {count}/{len(records)} synthetic WAV files. No voice-cloning source clips.")
    for index, row in enumerate(records[:count], 1):
        rel = row["audio_relpath"]
        local = out / rel
        if local.is_file() and local.stat().st_size > 0:
            continue
        remote = Path(hf_hub_download(REPO, rel, repo_type="dataset", revision=commit))
        local.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(remote, local)
        if index % 20 == 0:
            print(f"Audio downloaded/checked: {index}/{count}", flush=True)
    print("READY dataset:", out, "| records:", len(records), "| audio present:", count)
    print("Synthetic + CC BY-NC-SA 4.0. Never claim real customer call QA quality.")


if __name__ == "__main__":
    main()
