"""PhoWhisper ASR. Heavy dependencies (torch, transformers) are imported lazily, only when this
adapter is selected, so the service still starts in mock mode on a machine without them."""
from __future__ import annotations

import importlib.util
import threading
from typing import Optional

import numpy as np

from .base import ModelNotReady, Segment, Status


def _have(*mods: str) -> bool:
    return all(importlib.util.find_spec(m) is not None for m in mods)


class PhoWhisperAsr:
    name = "phowhisper"
    mock = False

    def __init__(self, model_id: str, device: str = "auto") -> None:
        self.model_id = model_id
        self.device_pref = device
        self._pipe = None
        self._lock = threading.Lock()  # one GPU job at a time (RTX 3050 has 4 GB)

    def status(self) -> Status:
        if not _have("torch", "transformers"):
            return Status(self.name, False, False,
                          "Chưa cài torch/transformers; xem docs/REAL_INFERENCE_SETUP.md và kiểm tra dung lượng/GPU trước khi cài.")
        state = "đã nạp" if self._pipe is not None else "sẽ nạp khi dùng lần đầu"
        return Status(self.name, True, False, f"{self.model_id} ({state})")

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
                return_timestamps=True,
                generate_kwargs={"language": "vi", "task": "transcribe"},
            )
        segments: list[Segment] = []
        chunks = out.get("chunks") or []
        for i, ch in enumerate(chunks):
            text = (ch.get("text") or "").strip()
            start, end = ch.get("timestamp") or (None, None)
            if not text:
                continue
            start = float(start or 0.0)
            if end is None:  # last chunk may be open-ended
                end = float(chunks[i + 1]["timestamp"][0]) if i + 1 < len(chunks) and chunks[i + 1]["timestamp"][0] is not None else duration
            end = min(float(end), duration)
            if end <= start:
                end = min(start + 0.5, duration)
            segments.append(Segment(round(start, 2), round(end, 2), text))
        return segments
