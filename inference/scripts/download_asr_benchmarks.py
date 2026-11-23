#!/usr/bin/env python3
"""Prepare REAL Vietnamese ASR benchmark subsets from public HF Parquet.

CPU/download-only; no PyTorch/CUDA; no remote-code execution or pickle.
Datasets:
* google/fleurs, vi_vn TEST, CC-BY 4.0 (ASR evaluation; 857 samples total).
* doof-ferb/fpt_fosd, train subset, CC-BY 4.0 (ASR diagnostic only).
Each output WAV is decoded with ffmpeg (16kHz mono), NOT synthesized.
Revision and original dataset Parquet hash are recorded in source_manifest.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

SOURCES = {
    "fleurs-vi-test": {
        "repo": "google/fleurs",
        "match": ("/vi_vn/test-", "test-00000-of-00001.parquet"),
        "text": ("raw_transcription", "transcription"),
        "license": "cc-by-4.0",
        "split": "test",
        "role": "held-out ASR evaluation, not call-center-specific",
    },
    "fpt-fosd-sample": {
        "repo": "doof-ferb/fpt_fosd",
        "match": ("data/train-", "train-00000-of-00002.parquet"),
        "text": ("transcription",),
        "license": "cc-by-4.0",
        "split": "train",
        "role": "ASR smoke/diagnostic only; NOT independent test if model has trained on FOSD",
    },
}


def checksum(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def select_filename(all_files: list[str], source: dict) -> str:
    prefix, suffix = source["match"]
    candidates = [name for name in all_files if prefix in "/" + name and name.endswith(suffix)]
    if len(candidates) != 1:
        raise RuntimeError(f"Expected exactly one pinned Parquet matching {prefix}*{suffix}; found {candidates}")
    return candidates[0]


def wav_from_bytes(content: bytes, output: Path):
    if not isinstance(content, bytes) or len(content) < 16:
        raise ValueError("Audio is missing embedded bytes in Parquet. Not substituting fake data.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".original", delete=False, dir=output.parent) as tmp:
        tmp.write(content)
        raw = Path(tmp.name)
    partial = output.with_suffix(".partial.wav")
    try:
        subprocess.run([
            "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(raw),
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
            str(partial),
        ], check=True, timeout=90)
        if not partial.is_file() or partial.stat().st_size <= 44:
            raise ValueError("ffmpeg produced invalid WAV.")
        partial.replace(output)
    finally:
        raw.unlink(missing_ok=True)
        partial.unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dataset", choices=sorted(SOURCES), required=True)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--limit", type=int, default=64, help="Only first N in official source order")
    opts = ap.parse_args()
    if not 1 <= opts.limit <= 2000:
        ap.error("Limit must be in [1,2000]")
    from huggingface_hub import HfApi, hf_hub_download
    import pyarrow.parquet as parquet

    spec = SOURCES[opts.dataset]
    out = opts.output.expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    api = HfApi()
    info = api.dataset_info(spec["repo"])
    revision = info.sha
    if not isinstance(revision, str) or len(revision) != 40:
        raise RuntimeError("Failed to pin immutable dataset revision.")
    filenames = api.list_repo_files(spec["repo"], repo_type="dataset", revision=revision)
    path = select_filename(filenames, spec)
    parquet_file = Path(hf_hub_download(repo_id=spec["repo"], repo_type="dataset",
                                        filename=path, revision=revision))
    source_hash = checksum(parquet_file)
    expected = out / "source_manifest.json"
    if expected.exists():
        existing = json.loads(expected.read_text(encoding="utf-8"))
        if existing.get("dataset_revision") != revision or existing.get("parquet_sha256") != source_hash:
            raise RuntimeError("Source revision changed since prior extraction; use a new output directory.")
    print(f"[ASR data] pinned {spec['repo']}@{revision}: {path} sha256={source_hash[:16]}", flush=True)

    stream = parquet.ParquetFile(parquet_file)
    text_fields = next((f for f in spec["text"] if f in stream.schema_arrow.names), None)
    if "audio" not in stream.schema_arrow.names or not text_fields:
        raise ValueError("Parquet audio/text schema changed; refuse guessing.")
    produced = []
    seen = 0
    for batch in stream.iter_batches(batch_size=16, columns=["audio", text_fields]):
        values = batch.to_pylist()
        for row in values:
            if seen >= opts.limit:
                break
            sample_number = seen
            seen += 1
            transcript = str(row[text_fields] or "").strip()
            audio = row["audio"]
            if not transcript or not isinstance(audio, dict) or not audio.get("bytes"):
                raise ValueError(f"Row {sample_number} has no audio bytes/transcript.")
            target = out / "audio" / f"{sample_number:05d}.wav"
            if not target.is_file() or target.stat().st_size <= 44:
                wav_from_bytes(audio["bytes"], target)
            produced.append({"id": f"{opts.dataset}:{sample_number}", "wav": str(target),
                             "text": transcript})
        if seen >= opts.limit:
            break
    if not produced:
        raise ValueError("No valid audio/transcript examples extracted.")
    manifest = {
        "dataset_id": spec["repo"], "dataset_revision": revision,
        "dataset_license": spec["license"], "split": spec["split"], "role": spec["role"],
        "source_parquet": path, "parquet_sha256": source_hash,
        "records": len(produced), "audio_format": "16kHz mono PCM WAV (ffmpeg)",
    }
    (out / "source_manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    target = out / "asr_eval.jsonl"
    with target.open("w", encoding="utf-8") as f:
        for row in produced:
            f.write(json.dumps(row, ensure_ascii=False)+"\n")
    print(f"[ASR data] DONE {len(produced)} genuine samples. Manifest: {target}",flush=True)


if __name__ == "__main__":
    main()
