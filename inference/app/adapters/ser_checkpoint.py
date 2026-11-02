"""Adapter for the project's TRAINED SER checkpoints.

The research code (model classes, preprocessing, fusion) is not part of this repository, so this
adapter does not guess an architecture. Instead it loads YOUR serving entry point:

    ISEMO_SER_FACTORY=my_package.serving:build_model     # importable "module:function"
    ISEMO_SER_CONFIG=C:/path/to/ser_config.json          # passed to the factory (checkpoint paths...)

`build_model(config: dict)` must return an object with

    predict(waveform: np.ndarray, text: str, speaker: str) -> dict
        waveform : float32 mono, 16 kHz, the utterance only
        returns  : {"fused": [p...], "acoustic": [p...] | None, "lexical": [p...] | None}
                   probabilities ordered like config["labels"] (default: neutral, happy, sad, angry)

Nothing is used for inference until it has been VERIFIED: run `python -m app.verify` once; it
writes verification.json (next to the config) bound to the config file's SHA-256. If the config or
checkpoints change, verification is invalidated. Set ISEMO_ALLOW_UNVERIFIED=1 to bypass for debugging.
"""
from __future__ import annotations

import hashlib
import importlib
import json
import sys
import threading
from pathlib import Path
from typing import Optional

from .base import EMOTIONS, AudioSlicer, ModelNotReady, SerItem, SerOutput, Status


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def verification_path(config_path: Path) -> Path:
    return config_path.with_name("verification.json")


def read_verification(config_path: Path) -> tuple[bool, str]:
    vp = verification_path(config_path)
    if not vp.is_file():
        return False, "chưa có verification.json — chạy: python -m app.verify --manifest <tệp.jsonl>"
    try:
        v = json.loads(vp.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False, "verification.json bị hỏng"
    if not v.get("verified"):
        return False, f"xác minh không đạt (macro-F1 {v.get('macroF1')})"
    if v.get("configSha256") != sha256_file(config_path):
        return False, "cấu hình đã thay đổi sau lần xác minh — chạy lại python -m app.verify"
    return True, f"đã xác minh (macro-F1 {v.get('macroF1')}, n={v.get('n')})"


class CheckpointSer:
    name = "checkpoint"
    mock = False

    def __init__(self, factory: str, config_path: str, allow_unverified: bool = False) -> None:
        self.factory = factory
        self.config_path = Path(config_path) if config_path else None
        self.allow_unverified = allow_unverified
        self._model = None
        self._labels: list[str] = list(EMOTIONS)
        self._lock = threading.Lock()

    # -- status -------------------------------------------------------------
    def _problem(self) -> Optional[str]:
        if not self.factory or ":" not in self.factory:
            return 'Chưa cấu hình ISEMO_SER_FACTORY (dạng "module:function").'
        if self.config_path is None or not self.config_path.is_file():
            return f"Không thấy tệp cấu hình ISEMO_SER_CONFIG ({self.config_path or 'chưa đặt'})."
        return None

    def status(self) -> Status:
        problem = self._problem()
        if problem:
            return Status(self.name, False, False, problem, verified=False)
        ok, why = read_verification(self.config_path)
        if not ok and not self.allow_unverified:
            return Status(self.name, False, False, f"Checkpoint chưa được xác minh: {why}", verified=False)
        suffix = "" if ok else f" (BỎ QUA xác minh: {why})"
        return Status(self.name, True, False, f"{self.factory}{suffix}", verified=ok)

    # -- loading ------------------------------------------------------------
    def _load(self):
        if self._model is not None:
            return self._model
        st = self.status()
        if not st.ready:
            raise ModelNotReady(st.detail)
        module_name, _, func_name = self.factory.partition(":")
        try:
            cfg = json.loads(self.config_path.read_text(encoding="utf-8"))
            cfg.setdefault("_config_dir", str(self.config_path.parent))
            if cfg["_config_dir"] not in sys.path:
                sys.path.insert(0, cfg["_config_dir"])  # lets the factory live next to its config
            model = getattr(importlib.import_module(module_name), func_name)(cfg)
        except Exception as e:
            raise ModelNotReady(f"Không nạp được mô hình SER qua {self.factory}: {e}") from e
        if not callable(getattr(model, "predict", None)):
            raise ModelNotReady(f"{self.factory} phải trả về đối tượng có phương thức predict(waveform, text, speaker).")
        labels = [str(x).lower() for x in cfg.get("labels", EMOTIONS)]
        if sorted(labels) != sorted(EMOTIONS):
            raise ModelNotReady(f"labels trong cấu hình phải là hoán vị của {list(EMOTIONS)}, nhận được {labels}.")
        self._labels = labels
        self._model = model
        return model

    def _canonical(self, probs) -> Optional[list[float]]:
        if probs is None:
            return None
        vec = [float(x) for x in probs]
        if len(vec) != len(self._labels):
            raise ValueError(f"mô hình trả {len(vec)} xác suất, cần {len(self._labels)}")
        by_label = dict(zip(self._labels, vec))
        return [by_label[e] for e in EMOTIONS]

    # -- inference ----------------------------------------------------------
    def predict(self, items: list[SerItem], audio: AudioSlicer) -> list[SerOutput]:
        with self._lock:
            model = self._load()
            outputs: list[SerOutput] = []
            for it in items:
                try:
                    res = model.predict(audio(it.start, it.end, it.speaker), it.text, it.speaker)
                    fused = self._canonical(res["fused"])
                    if fused is None:
                        raise KeyError("fused")
                    outputs.append(SerOutput(fused=fused, acoustic=self._canonical(res.get("acoustic")), lexical=self._canonical(res.get("lexical"))))
                except ModelNotReady:
                    raise
                except Exception as e:
                    raise ModelNotReady(f"Mô hình SER lỗi ở câu {it.id}: {e}") from e
            return outputs
