#!/usr/bin/env python3
"""Prepare a small, attributable OneVoice audio-only ZIP for the ISEmoTalk ASR -> QA upload test.

Run on FTISU: python3 scripts/export-upload-test-audio.py
Only reads the pinned dataset; never edits a model, transcript, database or dataset source.
OneVoice consists of TTS-synthesized customer-service dialogues, not genuine human calls.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path

SOURCE = Path.home() / "services" / "isemotalk-private" / "datasets" / "onevoice"
LIMIT_PER_LABEL = 3
MAX_BYTES = 30 * 1024 * 1024


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sample_path(root: Path, rel: object) -> Path | None:
    if not isinstance(rel, str) or not rel:
        return None
    try:
        candidate = (root / rel).resolve(strict=True)
        candidate.relative_to(root)
        if not candidate.is_file() or candidate.suffix.lower() != ".wav":
            return None
        size = candidate.stat().st_size
        if size < 1024 or size > MAX_BYTES:
            return None
        return candidate
    except (FileNotFoundError, OSError, ValueError):
        return None


def main() -> int:
    manifest_path = SOURCE / "source_manifest.json"
    records_path = SOURCE / "records.jsonl"
    if not manifest_path.is_file() or not records_path.is_file():
        print("ERROR: Chua thay OneVoice. Expected:", records_path, file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (manifest.get("dataset") != "nhatminh/OneVoice"
            or manifest.get("license") != "cc-by-nc-sa-4.0"
            or manifest.get("synthetic") is not True):
        print("ERROR: OneVoice manifest mismatch; not exporting unverified data.", file=sys.stderr)
        return 1

    root = SOURCE.resolve(strict=True)
    rows = []
    for line in records_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))

    chosen: list[tuple[int, Path, dict]] = []
    used_paths: set[Path] = set()
    used_agents: set[str] = set()
    for label in (1, 0):
        matches = [r for r in rows if str(r.get("label")) == str(label)]
        for unique_agent in (True, False):
            for row in matches:
                if sum(1 for lab, _, _ in chosen if lab == label) >= LIMIT_PER_LABEL:
                    break
                file = sample_path(root, row.get("audio_relpath"))
                if file is None or file in used_paths:
                    continue
                employee = str(row.get("employee_id") or "")
                if unique_agent and (not employee or employee in used_agents):
                    continue
                chosen.append((label, file, row))
                used_paths.add(file)
                if employee:
                    used_agents.add(employee)
        if sum(1 for lab, _, _ in chosen if lab == label) < LIMIT_PER_LABEL:
            print(f"ERROR: Not enough valid OneVoice WAV for source label {label}.", file=sys.stderr)
            return 1

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    folder = Path.home() / ("ISEmoTalk_test_audio_" + stamp)
    archive = folder.with_suffix(".zip")
    folder.mkdir(mode=0o700, exist_ok=False)

    details = [
        "ISEmoTalk - audio-only upload test",
        "SOURCE: nhatminh/OneVoice (https://huggingface.co/datasets/nhatminh/OneVoice)",
        "LICENSE: CC BY-NC-SA 4.0; non-commercial educational use, attribution required.",
        "IMPORTANT: This is synthetic/TTS Vietnamese call-center dialogue, NOT human call recordings.",
        "No transcript is supplied. Upload only the WAV files to test actual ASR.",
        "Source labels below are dataset metadata, NOT model predictions.",
        "Label 1 = source needs_attention; label 0 = source routine.",
        "",
        "FILE | SOURCE LABEL | SHA256 | SOURCE RECORD",
    ]
    for index, (label, source, row) in enumerate(chosen, start=1):
        filename = f"call_{index:02d}.wav"
        dest = folder / filename
        shutil.copyfile(source, dest)
        expected_hash = sha256(source)
        if sha256(dest) != expected_hash:
            raise RuntimeError("Copied audio hash differs from source for " + filename)
        details.append(f"{filename} | {label} | {expected_hash} | {row.get('audio_relpath', '')}")
        print(f"{filename}: source label {label}, {dest.stat().st_size / 1024 / 1024:.1f} MB")
    (folder / "README.txt").write_text("\n".join(details) + "\n", encoding="utf-8")

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as zipped:
        for file in sorted(folder.iterdir()):
            if file.is_file():
                zipped.write(file, arcname=file.name)
    with zipfile.ZipFile(archive) as zipped:
        bad = zipped.testzip()
        if bad is not None:
            raise RuntimeError("ZIP verification failed at " + bad)

    print("\nFOLDER:", folder)
    print("ZIP:", archive)
    print("ZIP_MB:", round(archive.stat().st_size / 1024 / 1024, 1))
    print("READY: Download the ZIP, extract it, and upload only call_*.wav in /scan.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
