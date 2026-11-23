#!/usr/bin/env python3
"""Download a bounded, consented HUMAN Vietnamese phone-call excerpt for thesis demonstration.

DataHive multilingual-conversations-sample: CC BY 4.0, real two-person phone
conversations recorded with consent. These are NOT customer-service calls.
Source provides NO transcripts, and this script never invents them.
Fetches ONLY a few pinned Vietnamese MP3 source files, then converts short
stereo excerpts to WAV using ffmpeg/ffprobe. CPU/network-only, no torch/CUDA.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

REPO = "datahiveai/multilingual-conversations-sample"
LICENSE = "cc-by-4.0"


def sha256(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def valid_revision(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[a-f0-9]{40}", value) is not None


def select_vietnamese(files: list[str], count: int) -> list[str]:
    candidates = sorted(f for f in files if re.fullmatch(r"preview/vi_[0-9]{6}\.mp3", f))
    if not candidates:
        raise RuntimeError("No pinned Vietnamese MP3 recordings in the official public preview.")
    return candidates[:count]


def convert_excerpt(source: Path, target: Path, start: int, seconds: int) -> float:
    tmp = target.with_suffix(".partial.wav")
    try:
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y",
             "-ss", str(start), "-i", str(source), "-t", str(seconds),
             "-vn", "-ac", "2", "-ar", "16000", "-c:a", "pcm_s16le", str(tmp)],
            check=True, timeout=180,
        )
        duration = float(subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(tmp)],
            text=True, timeout=15,
        ).strip())
        if duration < 10 or duration > seconds + 1 or tmp.stat().st_size < 1000:
            raise RuntimeError("Downloaded excerpt has invalid duration/bytes.")
        tmp.replace(target)
        return duration
    finally:
        tmp.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--start", type=int, default=30, help="Excerpt starts this many seconds into the authentic call.")
    parser.add_argument("--seconds", type=int, default=90)
    args = parser.parse_args()
    if args.count not in (1, 2) or not 0 <= args.start <= 180 or not 30 <= args.seconds <= 120:
        parser.error("Use count 1..2, start 0..180, and excerpt length 30..120 s.")

    from huggingface_hub import HfApi, hf_hub_download

    out = args.output.expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    manifest = out / "source_manifest.json"
    pinned = json.loads(manifest.read_text("utf8")) if manifest.exists() else {}
    if pinned and pinned.get("dataset_id") != REPO:
        raise RuntimeError("Existing output belongs to a different dataset; refusing mix.")
    revision = pinned.get("dataset_revision") or HfApi().dataset_info(REPO).sha
    if not valid_revision(revision):
        raise RuntimeError("Refusing dataset without immutable 40-hex revision.")

    files = HfApi().list_repo_files(REPO, repo_type="dataset", revision=revision)
    if "README.md" not in files:
        raise RuntimeError("No source card available for license checking.")
    readme_file = Path(hf_hub_download(REPO, "README.md", repo_type="dataset", revision=revision))
    if LICENSE not in readme_file.read_text("utf8").lower():
        raise RuntimeError("Source card no longer claims CC BY 4.0; do not assume permission.")

    selected = select_vietnamese(files, args.count)
    if pinned and (pinned.get("start_seconds") != args.start or
                   pinned.get("excerpt_seconds") != args.seconds or
                   [r.get("source_mp3") for r in pinned.get("records", [])] != selected):
        raise RuntimeError("Existing dataset uses a different excerpt selection; use a new output folder.")
    print(f"[phone-demo] Pinned {REPO}@{revision}, license {LICENSE}; {len(selected)} Vietnamese calls.", flush=True)

    rows = []
    for i, remote in enumerate(selected, 1):
        mp3 = Path(hf_hub_download(REPO, remote, repo_type="dataset", revision=revision))
        source_hash = sha256(mp3)
        wav = out / "audio" / f"phone_{i:02d}.wav"
        wav.parent.mkdir(parents=True, exist_ok=True)
        if wav.exists():
            if not pinned:
                raise RuntimeError("Untracked WAV exists without manifest: " + str(wav))
            old = pinned["records"][i - 1]
            if (old["source_sha256"] != source_hash or old["audio_sha256"] != sha256(wav)):
                raise RuntimeError("WAV/source checksum conflict; never silently overwrite.")
            duration = float(old["duration"])
        else:
            duration = convert_excerpt(mp3, wav, args.start, args.seconds)
        rows.append({
            "id": f"datahive:vi:{i:02d}", "wav": str(wav), "source_mp3": remote,
            "source_sha256": source_hash, "audio_sha256": sha256(wav),
            "duration": round(duration, 3), "excerpt_start_seconds": args.start,
            "transcript": None, "human_recorded": True,
        })
        print(f"[phone-demo] Stereo WAV saved: {wav.name} ({duration:.1f}s), no transcript.", flush=True)

    payload = {
        "dataset_id": REPO, "dataset_revision": revision, "dataset_license": LICENSE,
        "source_type": "consented_human_phone_conversation_not_call_center",
        "start_seconds": args.start, "excerpt_seconds": args.seconds,
        "transcripts_available": False, "records": rows,
        "attribution": "DataHive AI — Multilingual Conversations Sample, https://huggingface.co/datasets/" + REPO,
    }
    tmp = manifest.with_suffix(".partial.json")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    tmp.replace(manifest)
    print("[phone-demo] DONE. Real consented phone speech, NOT customer service; no transcripts, ASR, SER or QA generated.", flush=True)


if __name__ == "__main__":
    main()
