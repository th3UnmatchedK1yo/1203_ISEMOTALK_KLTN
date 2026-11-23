"""Check an authentic SER package against a held-out four-class sanity manifest.

python -m app.verify --manifest eval.jsonl --min-macro-f1 0.60 [--check-only]
Rows: {"audio":"clip.wav", "text":"...", "label":"angry", "start":0, "end":2}
Relative audio paths are resolved against the manifest. Check-only hashes assets
and validates inputs without importing the factory, running a model or writing a
verification record. A pass is NOT reproduction of a paper or call-center accuracy.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from . import audio
from .adapters.base import EMOTIONS, SerItem, normalize_probs
from .adapters.ser_checkpoint import (
    SCHEMA_VERSION, CheckpointSer, artifact_manifest, package_fingerprint,
    sha256_file, verification_path,
)
from .config import Settings


def macro_f1(y_true: list[str], y_pred: list[str]) -> tuple[float, dict]:
    if len(y_true) != len(y_pred) or any(x not in EMOTIONS for x in [*y_true, *y_pred]):
        raise ValueError("Nhãn/số lượng dự đoán không hợp lệ.")
    per, scores = {}, []
    for c in EMOTIONS:
        tp = sum(t == c and p == c for t, p in zip(y_true, y_pred))
        fp = sum(t != c and p == c for t, p in zip(y_true, y_pred))
        fn = sum(t == c and p != c for t, p in zip(y_true, y_pred))
        score = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.0
        scores.append(score)
        per[c] = {"f1": round(score, 8), "support": tp + fn}
    return sum(scores) / len(EMOTIONS), per


def validate_manifest(path: Path, settings: Settings) -> tuple[list[dict], list[dict]]:
    path = path.resolve()
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows:
        raise ValueError("Manifest đánh giá trống.")
    seen, labels, files, metadata = set(), set(), {}, {}
    for index, row in enumerate(rows, 1):
        if not isinstance(row, dict) or row.get("label") not in EMOTIONS:
            raise ValueError(f"Dòng {index}: label phải thuộc bốn lớp cảm xúc.")
        if not isinstance(row.get("audio"), str) or not row["audio"].strip():
            raise ValueError(f"Dòng {index}: thiếu đường dẫn audio.")
        if not isinstance(row.get("text", ""), str) or row.get("speaker", "unknown") not in ("agent", "customer", "unknown"):
            raise ValueError(f"Dòng {index}: text/speaker không hợp lệ.")
        audio_path = (path.parent / row["audio"]).resolve()
        if not audio_path.is_file():
            raise ValueError(f"Dòng {index}: không thấy audio.")
        if str(audio_path) not in metadata:
            metadata[str(audio_path)] = audio.probe(audio_path)
            files[str(audio_path)] = {"path": str(audio_path), "sha256": sha256_file(audio_path)}
        info = metadata[str(audio_path)]
        if (not math.isfinite(info.duration) or not 0 < info.duration <= settings.max_duration_sec
                or math.ceil(info.duration * settings.sample_rate) * 4 > settings.max_decoded_bytes):
            raise ValueError(f"Dòng {index}: audio vượt giới hạn thời lượng/bộ nhớ.")
        start, end = row.get("start", 0.0), row.get("end", info.duration)
        if (isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, (int, float))
                or not isinstance(end, (int, float)) or not math.isfinite(start) or not math.isfinite(end)
                or not 0 <= start < end <= info.duration + 0.05):
            raise ValueError(f"Dòng {index}: khoảng thời gian không hợp lệ.")
        identity = (str(audio_path), start, end)
        if identity in seen:
            raise ValueError(f"Dòng {index}: audio/khoảng thời gian đánh giá bị lặp.")
        seen.add(identity); labels.add(row["label"])
        row.update(audio=str(audio_path), start=float(start), end=float(end))
    if labels != set(EMOTIONS):
        raise ValueError("Manifest phải có mẫu held-out cho mỗi lớp: neutral, happy, sad, angry.")
    return rows, sorted(files.values(), key=lambda entry: entry["path"])


def _write_atomic(path: Path, data: dict) -> None:
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=path.parent, prefix=".verification-", suffix=".json", encoding="utf-8", delete=False) as handle:
            temp_path = Path(handle.name)
            json.dump(data, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write("\n"); handle.flush(); os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", required=True, type=Path)
    ap.add_argument("--min-macro-f1", required=True, type=float, help="minimum four-class sanity score, not a paper reproduction claim")
    ap.add_argument("--check-only", action="store_true", help="validate and hash local inputs; do not load a model or write verification")
    args = ap.parse_args(argv)
    try:
        if not math.isfinite(args.min_macro_f1) or not 0 < args.min_macro_f1 <= 1:
            raise ValueError("--min-macro-f1 phải hữu hạn và nằm trong (0, 1].")
        s = Settings.load()
        cfg = Path(s.ser_config).expanduser().resolve()
        if not s.ser_factory or ":" not in s.ser_factory:
            raise ValueError("Thiếu ISEMO_SER_FACTORY.")
        _, assets = artifact_manifest(cfg)
        rows, evaluation_audio = validate_manifest(args.manifest, s)
        manifest_info = {"path": str(args.manifest.resolve()), "sha256": sha256_file(args.manifest)}
        config_sha = sha256_file(cfg)
        # A fresh evaluation must be able to replace a corrupt/obsolete record;
        # only the current package and current evaluation inputs bind this run.
        identity = package_fingerprint(cfg, include_verification=False)
        if args.check_only:
            print(f"Đã kiểm tra {len(rows)} mẫu, bốn lớp và {len(assets)} artifacts. Chưa nạp mô hình; chưa xác minh dự đoán.")
            return 0
        ser = CheckpointSer(s.ser_factory, str(cfg), allow_unverified=True)
        y_true, y_pred = [], []
        last_path, wave = None, None
        for i, row in enumerate(rows):
            if row["audio"] != last_path:
                wave = audio.decode(Path(row["audio"]), s.sample_rate, 1, max_bytes=s.max_decoded_bytes)
                last_path = row["audio"]
            start, end = row["start"], row["end"]
            a, b = int(start * s.sample_rate), min(len(wave), int(end * s.sample_rate))
            if a >= b:
                raise ValueError(f"Dòng {i + 1}: đoạn audio rỗng sau giải mã.")
            item = SerItem(f"v{i}", start, end, row.get("text", ""), row.get("speaker", "unknown"))
            out = ser.predict([item], lambda *_: wave[a:b])[0]
            probs = normalize_probs(out.fused)
            y_pred.append(EMOTIONS[max(range(4), key=probs.__getitem__)])
            y_true.append(row["label"])
            print(f"[{i + 1}/{len(rows)}] {row['label']:>8} -> {y_pred[-1]}")
        if package_fingerprint(cfg, include_verification=False) != identity or sha256_file(args.manifest) != manifest_info["sha256"]:
            raise ValueError("Gói mô hình hoặc manifest đã thay đổi trong lúc đánh giá.")
        for entry in evaluation_audio:
            if sha256_file(Path(entry["path"])) != entry["sha256"]:
                raise ValueError("Audio đánh giá đã thay đổi trong lúc chạy.")
        score, per = macro_f1(y_true, y_pred)
        ok = score >= args.min_macro_f1
        _write_atomic(verification_path(cfg), {
            "schemaVersion": SCHEMA_VERSION, "verified": ok, "macroF1": score,
            "threshold": args.min_macro_f1, "n": len(rows), "perClass": per,
            "configSha256": config_sha, "factory": s.ser_factory, "artifacts": assets,
            "manifest": manifest_info, "evaluationAudio": evaluation_audio,
            "scope": "four_class_sanity_check_not_paper_reproduction_or_call_center_accuracy",
            "verifiedAt": datetime.now(timezone.utc).isoformat(),
        })
        print(f"macro-F1 = {score:.4f} -> {'ĐẠT' if ok else 'KHÔNG ĐẠT'} kiểm tra bốn lớp; chưa chứng minh độ chính xác tổng đài.")
        return 0 if ok else 1
    except Exception as exc:
        print(f"Không thể xác minh: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
