"""Verify the trained SER checkpoints before they are allowed to serve real predictions.

    python -m app.verify --manifest eval.jsonl --min-macro-f1 0.60

manifest.jsonl, one JSON object per line:
    {"audio": "C:/data/a.wav", "start": 1.2, "end": 4.8, "text": "...", "label": "angry", "speaker": "customer"}
(start/end optional = whole file). Use a held-out set whose scores you already know from the research
experiments; set --min-macro-f1 to a value that reproduces your reported results.

On success writes verification.json next to ISEMO_SER_CONFIG, bound to the config file's SHA-256.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import audio
from .adapters.base import EMOTIONS, SerItem
from .adapters.ser_checkpoint import CheckpointSer, sha256_file, verification_path
from .config import Settings


def macro_f1(y_true: list[str], y_pred: list[str]) -> tuple[float, dict]:
    per = {}
    for c in EMOTIONS:
        tp = sum(t == c and p == c for t, p in zip(y_true, y_pred))
        fp = sum(t != c and p == c for t, p in zip(y_true, y_pred))
        fn = sum(t == c and p != c for t, p in zip(y_true, y_pred))
        prec, rec = tp / (tp + fp) if tp + fp else 0.0, tp / (tp + fn) if tp + fn else 0.0
        per[c] = {"f1": round(2 * prec * rec / (prec + rec), 4) if prec + rec else 0.0, "support": tp + fn}
    present = [v["f1"] for v in per.values() if v["support"] > 0]
    return (sum(present) / len(present) if present else 0.0), per


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manifest", required=True, type=Path)
    ap.add_argument("--min-macro-f1", required=True, type=float, help="threshold that counts as 'reproduces the research results'")
    args = ap.parse_args(argv)

    s = Settings.load()
    ser = CheckpointSer(s.ser_factory, s.ser_config, allow_unverified=True)
    st = ser.status()
    if not st.ready:
        print(f"Không thể xác minh: {st.detail}", file=sys.stderr)
        return 2

    rows = [json.loads(line) for line in args.manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    y_true, y_pred = [], []
    for i, r in enumerate(rows):
        wave = audio.decode(Path(r["audio"]), s.sample_rate, 1)
        a, b = int(r.get("start", 0) * s.sample_rate), int(r.get("end", len(wave) / s.sample_rate) * s.sample_rate)
        item = SerItem(f"v{i}", r.get("start", 0.0), r.get("end", len(wave) / s.sample_rate), r.get("text", ""), r.get("speaker", "unknown"))
        out = ser.predict([item], lambda *_: wave[a:max(b, a + 1)])[0]
        y_pred.append(EMOTIONS[max(range(4), key=list(out.fused).__getitem__)])
        y_true.append(r["label"])
        print(f"[{i + 1}/{len(rows)}] {r['label']:>8} -> {y_pred[-1]}")

    score, per = macro_f1(y_true, y_pred)
    ok = score >= args.min_macro_f1
    cfg = Path(s.ser_config)
    verification_path(cfg).write_text(
        json.dumps(
            {
                "verified": ok, "macroF1": round(score, 4), "threshold": args.min_macro_f1, "n": len(rows), "perClass": per,
                "configSha256": sha256_file(cfg), "factory": s.ser_factory,
                "verifiedAt": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"macro-F1 = {score:.4f} (ngưỡng {args.min_macro_f1}) -> {'ĐẠT' if ok else 'KHÔNG ĐẠT'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
