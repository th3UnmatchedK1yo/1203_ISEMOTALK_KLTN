"""PhoWhisper ASR. Heavy dependencies (torch, transformers) are imported lazily, only when this
adapter is selected, so the service still starts in mock mode on a machine without them."""
from __future__ import annotations

import importlib.util
import threading
from typing import Optional

import numpy as np

from .base import ModelNotReady, Segment, Status
from ..asr_segments import timestamped_asr_spans


def _have(*mods: str) -> bool:
    return all(importlib.util.find_spec(m) is not None for m in mods)


class PhoWhisperAsr:
    name = "phowhisper"
    mock = False

    def __init__(self, model_id: str, device: str = "auto", revision: str = "") -> None:
        self.model_id = model_id
        self.revision = revision
        self.model_identity = model_id + ("@" + revision if revision else "")
        self.device_pref = device
        self._pipe = None
        self._lock = threading.Lock()  # one GPU job at a time (RTX 3050 has 4 GB)

    def status(self) -> Status:
        if not _have("torch", "transformers"):
            return Status(self.name, False, False,
                          "Chưa cài torch/transformers; xem docs/REAL_INFERENCE_SETUP.md và kiểm tra dung lượng/GPU trước khi cài.")
        state = "đã nạp" if self._pipe is not None else "sẽ nạp khi dùng lần đầu"
        return Status(self.name, True, False, f"{self.model_identity} ({state})")

    def _load(self):
        if self._pipe is not None:
            return self._pipe
        if not _have("torch", "transformers"):
            raise ModelNotReady("Chưa cài torch/transformers cho PhoWhisper (xem docs/REAL_INFERENCE_SETUP.md).")
        import torch
        from transformers import pipeline

        use_cuda = torch.cuda.is_available() and self.device_pref in ("auto", "cuda")
        if self.device_pref == "cuda" and not torch.cuda.is_available():
            raise ModelNotReady("Yêu cầu CUDA nhưng PyTorch không thấy GPU. Cài bản torch có CUDA hoặc đặt ISEMO_ASR_DEVICE=cpu.")
        try:
            self._pipe = pipeline(
                "automatic-speech-recognition",
                model=self.model_id,
                revision=self.revision or None,
                device=0 if use_cuda else -1,
                torch_dtype=torch.float16 if use_cuda else torch.float32,
                chunk_length_s=30,
            )
        except Exception as e:  # network, bad id, OOM...
            raise ModelNotReady(f"Không nạp được mô hình ASR '{self.model_id}': {e}") from e
        return self._pipe

    def transcribe(self, wave: np.ndarray, sample_rate: int, duration: float) -> list[Segment]:
        with self._lock:
            pipe = self._load()
            out = pipe(
                {"raw": wave.astype(np.float32), "sampling_rate": sample_rate},
                # Segment-level timestamps (True) can yield one multi-minute
                # text block. Whisper supports aligned word timestamps, so
                # group only real timed words into readable spans.
                return_timestamps="word",
                generate_kwargs={"language": "vi", "task": "transcribe", "condition_on_prev_tokens": False},
            )
        try:
            return timestamped_asr_spans(out.get("chunks") or [], duration)
        except ValueError as exc:
            # Never invent timestamps by dividing a long text by word count.
            raise ModelNotReady("PhoWhisper word alignment failed: " + str(exc)) from exc
