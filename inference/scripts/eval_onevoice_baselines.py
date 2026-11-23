#!/usr/bin/env python3
"""Locked no-training baselines on SAME OneVoice held-out voice group as XLM-R.

Predefined keyword list; no gold label vocabulary tuning or test leakage.
Random expectation depends on seed; run 100 seeded permutations and report
distribution. SOURCE IS SYNTHETIC; not a deployed human QA outcome metric.
"""
from __future__ import annotations
import argparse
import json
import random
import statistics
from pathlib import Path
from train_onevoice_qa import metrics

# FIXED before analyzing data; deliberately simple explainable baseline.
KEYWORDS = (
    "khiếu nại", "hoàn tiền", "chưa nhận", "không nhận", "không được",
    "không thể", "lỗi", "hỏng", "hư", "chậm", "trễ",
    "mất", "hủy", "bị khóa", "không hài lòng", "gọi lại", "lần thứ",
)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dataset", type=Path, required=True)
    p.add_argument("--model-report", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    root = a.dataset.expanduser().resolve()
    report = json.loads(a.model_report.read_text(encoding="utf-8"))
    rows = [json.loads(s) for s in (root/"records.jsonl").read_text(encoding="utf-8").splitlines() if s]
    test_voices = set(report["split"]["test"]["customer_voice_ids"])
    test = [r for r in rows if r["customer_voice_id"] in test_voices]
    if len(test) != report["split"]["test"]["n"]:
        raise RuntimeError("Holdout count mismatch, refusing unmatched baseline.")
    import hashlib
    ids_hash = hashlib.sha256(json.dumps(sorted(r["id"] for r in test)).encode()).hexdigest()
    if ids_hash != report["split"]["test"]["ids_sha256"]:
        raise RuntimeError("Holdout record hashes changed, refusing unmatched baseline.")
    labels = [r["label"] for r in test]
    keyword_scores = [float(any(term in r["text"].lower() for term in KEYWORDS)) for r in test]
    # Stable, deterministic tie breaking in metrics() is not random:
    # therefore use seeded random scores instead of constant-zero scores.
    random_runs = []
    for seed in range(1000, 1100):
        rng = random.Random(seed)
        random_runs.append(metrics(labels, [rng.random() for _ in labels]))
    keyword_result = metrics(labels, keyword_scores)
    outcome = {
        "source":"nhatminh/OneVoice", "synthetic":True,
        "test_voice_ids":sorted(test_voices), "test_records":len(test),
        "model_test_metrics": report["test_metrics"],
        "fixed_keyword": {
            "keywords": list(KEYWORDS), "metric":keyword_result,
            "note":"Rules selected in advance; not tuned to test labels; ties broken by source order",
        },
        "random_rank_100_seeds": {
            "precision_at_k_mean": statistics.mean(r["precision_at_k"] for r in random_runs),
            "precision_at_k_stdev": statistics.stdev(r["precision_at_k"] for r in random_runs),
            "recall_at_k_mean": statistics.mean(r["recall_at_k"] for r in random_runs),
            "macro_f1_mean": statistics.mean(r["macro_f1"] for r in random_runs),
            "seeds":"1000..1099",
        },
        "warnings":[
            "Synthetic labels may reflect generating templates, not independent QA annotators.",
            "Only FIVE synthetic customer voices; unseen voice does not guarantee unseen script.",
            "Keyword list may share language with synthetic templates; no tuning on test.",
            "Comparison uses original ground-truth text, not imperfect ASR output.",
        ],
    }
    a.output.parent.mkdir(parents=True, exist_ok=True)
    if a.output.exists():
        raise FileExistsError("Baseline report already exists. Use versioned output, do not silently replace.")
    a.output.write_text(json.dumps(outcome,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("MATCHED HOLDOUT",len(test),"voice IDs",sorted(test_voices))
    print("MODEL macro-F1",report["test_metrics"]["macro_f1"],
          "P@K",report["test_metrics"]["precision_at_k"])
    print("KEYWORD macro-F1",keyword_result["macro_f1"],"P@K",keyword_result["precision_at_k"])
    print("RANDOM P@K mean",outcome["random_rank_100_seeds"]["precision_at_k_mean"])
    print("Report:",a.output)

if __name__ == "__main__":
    main()
