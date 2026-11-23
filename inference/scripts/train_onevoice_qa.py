#!/usr/bin/env python3
"""CUDA-only, grouped-held-out OneVoice call-level QA classifier.

Task is needs_attention on SYNTHETIC scripted Vietnamese transcripts, NOT SER.
Fine-tune real pretrained XLM-RoBERTa, with one customer voice group held
out for validation and another for test. No voice/text overlap from those
customer groups is used to update weights. No CPU fallback. Keep final
test untouched until best epoch is picked on validation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import Counter
from pathlib import Path

LABEL_NAMES = ("routine", "needs_attention")
MODEL_ID = "FacebookAI/xlm-roberta-base"


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def split_records(records: list[dict], seed: int) -> dict[str, list[dict]]:
    voices = sorted({r["customer_voice_id"] for r in records})
    if len(voices) < 5:
        raise ValueError(f"Require >=5 separate synthetic customer voices for grouped split; got {len(voices)}.")
    rnd = random.Random(seed)
    rnd.shuffle(voices)
    test, val = voices[0], voices[1]
    groups = {
        "train": [r for r in records if r["customer_voice_id"] not in {test, val}],
        "val": [r for r in records if r["customer_voice_id"] == val],
        "test": [r for r in records if r["customer_voice_id"] == test],
    }
    for part, rows in groups.items():
        labels = Counter(r["label"] for r in rows)
        if not rows or not all(labels.get(c, 0) >= 2 for c in (0, 1)):
            raise ValueError(f"{part} has insufficient two-class support: {dict(labels)}")
    assert not ({r["customer_voice_id"] for r in groups["train"]} &
                {r["customer_voice_id"] for r in groups["val"] + groups["test"]})
    if not {r["id"] for r in groups["train"]}.isdisjoint({r["id"] for r in groups["val"] + groups["test"]}):
        raise ValueError("Duplicate file ID across splits")
    return groups


def metrics(labels: list[int], probabilities: list[float], top_k: int = 25) -> dict:
    if len(labels) != len(probabilities) or not labels:
        raise ValueError("Invalid metric inputs")
    guesses = [int(p >= 0.5) for p in probabilities]
    per = {}
    for cls in (0, 1):
        tp = sum(t == cls and p == cls for t, p in zip(labels, guesses))
        fp = sum(t != cls and p == cls for t, p in zip(labels, guesses))
        fn = sum(t == cls and p != cls for t, p in zip(labels, guesses))
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        f = 2 * p * r / (p + r) if p + r else 0.0
        per[LABEL_NAMES[cls]] = {"precision": p, "recall": r, "f1": f, "support": sum(y == cls for y in labels)}
    n = min(top_k, len(labels))
    selected = sorted(range(len(probabilities)), key=lambda i: (-probabilities[i], i))[:n]
    found = sum(labels[i] == 1 for i in selected)
    positives = sum(labels)
    return {
        "count": len(labels),
        "macro_f1": sum(per[k]["f1"] for k in LABEL_NAMES) / 2,
        "accuracy": sum(a == b for a, b in zip(labels, guesses)) / len(labels),
        "precision_at_k": found / n,
        "recall_at_k": found / positives if positives else 0.0,
        "k": n,
        "confusion_rows_truth_cols_prediction": [
            [sum(t == c and p == v for t, p in zip(labels, guesses)) for v in (0, 1)]
            for c in (0, 1)
        ],
        "per_class": per,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dataset", type=Path, required=True, help="OneVoice download root with source_manifest.json")
    p.add_argument("--out", type=Path, required=True, help="private output directory, NOT a Git checkout")
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument("--max-length", type=int, default=256)
    p.add_argument("--lr", type=float, default=2e-5)
    p.add_argument("--seed", type=int, default=2026)
    p.add_argument("--model", type=str, default=MODEL_ID)
    args = p.parse_args()
    if not 1 <= args.epochs <= 20 or not 1 <= args.batch_size <= 64 or not 64 <= args.max_length <= 512:
        p.error("Unsupported epochs, batch size or max length.")
    import torch
    from torch.utils.data import TensorDataset, DataLoader
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    from huggingface_hub import HfApi, snapshot_download

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA REQUIRED: do not silently train or fine-tune on CPU.")
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    random.seed(args.seed)
    device = torch.device("cuda:0")
    print("[train] GPU:", torch.cuda.get_device_name(device), "| torch:", torch.__version__, flush=True)

    root = args.dataset.expanduser().resolve()
    manifest_path, records_path = root / "source_manifest.json", root / "records.jsonl"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("dataset") != "nhatminh/OneVoice" or manifest.get("license") != "cc-by-nc-sa-4.0" or manifest.get("synthetic") is not True:
        raise ValueError("Dataset identity/license/synthetic flag missing.")
    if sha(records_path) != manifest.get("records_sha256"):
        raise ValueError("OneVoice metadata records changed after download.")
    records = [json.loads(s) for s in records_path.read_text(encoding="utf-8").splitlines() if s.strip()]
    if len(records) != manifest["records"]:
        raise ValueError("Unexpected dataset row count.")
    if any(r.get("label") not in (0, 1) or not str(r.get("text", "")).strip() for r in records):
        raise ValueError("Invalid needs_attention label or empty transcript.")
    groups = split_records(records, args.seed)
    dest = args.out.expanduser().resolve()
    if (dest / "model.safetensors").exists() or (dest / "training_result.json").exists():
        raise FileExistsError("Completed model/output exists; use a new versioned output directory.")

    pretrained_sha = HfApi().model_info(args.model).sha
    if not isinstance(pretrained_sha, str) or len(pretrained_sha) != 40:
        raise ValueError("Cannot resolve an immutable pretrained model revision.")
    pretrained = snapshot_download(repo_id=args.model, revision=pretrained_sha)
    tokenizer = AutoTokenizer.from_pretrained(pretrained, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(
        pretrained, num_labels=2, id2label={0: LABEL_NAMES[0], 1: LABEL_NAMES[1]},
        label2id={LABEL_NAMES[0]: 0, LABEL_NAMES[1]: 1},
    ).to(device)
    model.train()
    train_counts = Counter(r["label"] for r in groups["train"])
    weights = torch.tensor(
        [len(groups["train"]) / (2 * train_counts[i]) for i in (0, 1)],
        dtype=torch.float32, device=device,
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    criterion = torch.nn.CrossEntropyLoss(weight=weights)
    use_bf16 = bool(torch.cuda.is_bf16_supported())

    def make_loader(part: str, shuffle: bool):
        batch = tokenizer(
            [r["text"] for r in groups[part]], padding="max_length", truncation=True,
            max_length=args.max_length, return_tensors="pt",
        )
        dataset = TensorDataset(
            batch["input_ids"], batch["attention_mask"],
            torch.tensor([r["label"] for r in groups[part]], dtype=torch.long),
        )
        generator = torch.Generator().manual_seed(args.seed)
        return DataLoader(dataset, batch_size=args.batch_size, shuffle=shuffle, generator=generator)

    loaders = {part: make_loader(part, part == "train") for part in groups}

    def predict(part: str):
        model.eval()
        labels, scores = [], []
        with torch.inference_mode():
            for ids, masks, y in loaders[part]:
                with torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=use_bf16):
                    logits = model(input_ids=ids.to(device), attention_mask=masks.to(device)).logits
                scores.extend(torch.softmax(logits.float(), -1)[:, 1].cpu().tolist())
                labels.extend(y.tolist())
        return labels, scores

    best, history = -1.0, []
    dest.mkdir(parents=True, exist_ok=True)
    for epoch in range(1, args.epochs + 1):
        model.train()
        total, steps = 0.0, 0
        for ids, masks, y in loaders["train"]:
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=use_bf16):
                logits = model(input_ids=ids.to(device), attention_mask=masks.to(device)).logits
                loss = criterion(logits.float(), y.to(device))
            if not bool(torch.isfinite(loss)):
                raise RuntimeError("Non-finite training loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total += float(loss.detach().cpu())
            steps += 1
        labels, scores = predict("val")
        report = metrics(labels, scores)
        history.append({"epoch": epoch, "mean_train_loss": total / steps, "val": report})
        print(f"[train] epoch={epoch} loss={total / steps:.4f} val_macro_f1={report['macro_f1']:.4f} val_P@25={report['precision_at_k']:.4f}", flush=True)
        if report["macro_f1"] > best:
            best = report["macro_f1"]
            model.save_pretrained(dest, safe_serialization=True)
            tokenizer.save_pretrained(dest)
    # Test once, strictly after selecting the best epoch on validation.
    model = AutoModelForSequenceClassification.from_pretrained(str(dest)).to(device)
    y, p_test = predict("test")
    test = metrics(y, p_test)
    split_info = {
        part: {
            "n": len(rows),
            "positive": sum(r["label"] for r in rows),
            "customer_voice_ids": sorted({r["customer_voice_id"] for r in rows}),
            "ids_sha256": hashlib.sha256(json.dumps(sorted(r["id"] for r in rows)).encode()).hexdigest(),
        } for part, rows in groups.items()
    }
    result = {
        "task": "call_level_needs_attention", "model": args.model,
        "pretrained_commit": pretrained_sha,
        "dataset": manifest["dataset"], "dataset_commit": manifest["commit"],
        "dataset_records_sha256": manifest["records_sha256"],
        "synthetic": True, "license": manifest["license"],
        "training_device": str(device), "gpu": torch.cuda.get_device_name(device),
        "torch": torch.__version__, "seed": args.seed, "epochs": args.epochs,
        "batch_size": args.batch_size, "max_length": args.max_length, "lr": args.lr,
        "split_protocol": "heldout_customer_voice_id; grouped speakers; transcript-only labels; random template leakage may remain",
        "split": split_info, "history": history,
        "test_metrics": test,
        "limits": [
            "AI-generated scripted call audio and synthetic needs_attention labels, not real QA ground truth.",
            "No voice-based acoustic features trained in this model.",
            "Customer voice groups disjoint; agent/template overlap not fully controlled.",
            "Ground-truth original transcript is used for this training, not noisy ASR transcript.",
        ],
    }
    (dest / "training_result.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("[train] FINISHED CUDA fine-tuning; TEST macro-F1:", round(test["macro_f1"], 4), "P@25:", round(test["precision_at_k"], 4))
    print("[train] Model:", dest, "| Synthetic only. Run separate ASR-domain & QA evaluation before business claims.")


if __name__ == "__main__":
    main()
