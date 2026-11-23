"""Separate call-level QA attention classifier trained on synthetic OneVoice.

This is NOT the four-class SER model and NOT a human-confirmed QA decision.
Only serves a local, versioned, CUDA-trained checkpoint that passed a held-out
voice-group test. Never silently fall back to keywords or mock predictions.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
from pathlib import Path

from .adapters.base import ModelNotReady


def window_starts(total: int, payload: int, max_windows: int = 48) -> tuple[list[int], bool]:
    """Return bounded, deterministic overlapping token windows, preserving the tail.

    Incompleteness is flagged if the 48-window safety cap prevents contiguous
    full coverage. This is a deployment heuristic; it is not a new QA model.
    """
    if total < 1 or payload < 1 or max_windows < 2:
        raise ValueError("Invalid token window parameters.")
    if total <= payload:
        return [0], False
    stride = max(1, payload // 2)
    starts = list(range(0, total - payload + 1, stride))
    if starts[-1] != total - payload:
        starts.append(total - payload)
    if len(starts) <= max_windows:
        return starts, False
    picks = [round(i * (len(starts) - 1) / (max_windows - 1)) for i in range(max_windows)]
    return sorted(set(starts[i] for i in picks)), True


class QATriageModel:
    def __init__(self):
        raw = os.getenv("ISEMO_QA_MODEL_DIR", "").strip()
        self.root = Path(raw).expanduser().resolve() if raw else None
        self._lock = threading.Lock()
        self._model = None
        self._tokenizer = None
        self._info = None
        self._weight_sha = ""

    def status(self) -> dict:
        if self.root is None:
            return {"ready": False, "loaded": False, "adapter": "xlm-roberta-qa", "domain": "synthetic_onevoice", "detail": "ISEMO_QA_MODEL_DIR not configured"}
        report = self.root / "training_result.json"
        weight = self.root / "model.safetensors"
        if not report.is_file() or not weight.is_file():
            return {"ready": False, "loaded": False, "adapter": "xlm-roberta-qa", "domain": "synthetic_onevoice", "detail": "QA model weights/training report missing"}
        return {"ready": True, "loaded": self._model is not None, "adapter": "xlm-roberta-qa", "domain": "synthetic_onevoice",
                "detail": "Trained on synthetic OneVoice transcript, NOT tested on real call-center QA labels."}

    def _load(self):
        if self._model is not None:
            return
        if not self.status()["ready"]:
            raise ModelNotReady("QA attention model not ready; train the real CUDA classifier first.")
        try:
            import torch
            from transformers import AutoModelForSequenceClassification, AutoTokenizer
            if not torch.cuda.is_available():
                raise ModelNotReady("QA model requires GPU CUDA for serving, no fake or CPU fallback.")
            info = json.loads((self.root / "training_result.json").read_text(encoding="utf-8"))
            if (info.get("task") != "call_level_needs_attention"
                    or info.get("synthetic") is not True
                    or info.get("dataset") != "nhatminh/OneVoice"
                    or "test_metrics" not in info
                    or not str(info.get("training_device", "")).startswith("cuda")):
                raise ValueError("QA training provenance missing or incompatible.")
            model = AutoModelForSequenceClassification.from_pretrained(str(self.root))
            labels = getattr(model.config, "id2label", {})
            if labels.get(0) != "routine" or labels.get(1) != "needs_attention":
                raise ValueError("QA head label order differs from training contract.")
            tok = AutoTokenizer.from_pretrained(str(self.root))
            weight = self.root / "model.safetensors"
            h = hashlib.sha256()
            with weight.open("rb") as source:
                for block in iter(lambda: source.read(1048576), b""):
                    h.update(block)
            self._weight_sha = h.hexdigest()
            self._info = info
            self._tokenizer, self._model = tok, model.eval().to("cuda:0")
        except ModelNotReady:
            raise
        except Exception as e:
            raise ModelNotReady(f"Cannot load genuine trained QA classifier: {e}") from e

    def predict(self, text: str) -> dict:
        text = str(text).strip()
        if not text or len(text) > 100_000:
            raise ValueError("QA triage requires 1-100000 characters of valid transcript.")
        with self._lock:
            self._load()
            import torch
            length = int(self._info.get("max_length", 256))
            if not 64 <= length <= 512:
                raise ModelNotReady("Invalid saved QA token limit.")

            # The old implementation silently scored only the first 256 tokens:
            # e.g. late escalations in OneVoice were never seen. Each window now
            # uses the SAME genuine checkpoint, without any keyword fallback.
            ids = self._tokenizer(text, add_special_tokens=False, truncation=False)["input_ids"]
            payload = length - int(self._tokenizer.num_special_tokens_to_add(pair=False))
            if payload < 32:
                raise ModelNotReady("QA tokenizer special-token count is incompatible with training.")
            starts, incomplete = window_starts(len(ids), payload, max_windows=48)
            scores = []
            with torch.inference_mode():
                for start in starts:
                    batch = self._tokenizer.prepare_for_model(
                        ids[start:start + payload],
                        add_special_tokens=True, return_attention_mask=True,
                        return_tensors="pt",
                    )
                    logits = self._model(**{k: v.to("cuda:0") for k, v in batch.items()}).logits
                    scores.append(float(torch.softmax(logits.float(), dim=-1)[0, 1].cpu().item()))
            if not scores:
                raise ModelNotReady("Tokenizer returned no usable QA window.")

            # Conservative attention SCREENING heuristic: max window probability.
            # It is NOT the trained full-call score and is NOT calibrated for the
            # windowed deployment. Human QA still determines the actual case.
            value = max(scores)
            return {
                "label": "needs_attention" if value >= 0.5 else "routine",
                "score": value,
                "model": "xlm-roberta-qa@" + self._weight_sha[:16] + "/window-max-v2",
                "modelSha256": self._weight_sha,
                "dataset": "synthetic_onevoice",
                "truncated": bool(incomplete),
                "source": "model",
                "note": (
                    f"Scanned {len(starts)} token windows with a genuine XLM-R checkpoint, "
                    "max-window attention heuristic; NOT a calibrated full-call probability. "
                    + ("Some tokens omitted due to 48-window safety limit." if incomplete else "All transcript tokens covered.")
                ),
            }
