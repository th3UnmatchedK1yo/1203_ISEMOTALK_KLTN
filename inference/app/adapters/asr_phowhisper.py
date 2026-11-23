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
        self._lock = threading.Lock()  # serialize GPU generation, including fallback retries
        self.timing_mode = "word_aligned"
        self.alignment_warning = ""

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

    @staticmethod
    def _generation() -> dict:
        return {"language": "vi", "task": "transcribe", "condition_on_prev_tokens": False}

    def _fallback_audio_windows(
        self, pipe, wave: np.ndarray, sample_rate: int, duration: float
    ) -> list[Segment]:
        """Infer independent 12-second audio windows on genuine sample bounds.

        Word alignment can be inconsistent with Whisper's chunk stitching.
        These time intervals indicate *audio window coverage*, not spoken
        word boundaries or inferred turns; provenance must say so.
        """
        if sample_rate <= 0:
            raise ModelNotReady("Invalid ASR sample rate.")
        step = 12 * sample_rate
        out: list[Segment] = []
        for offset in range(0, len(wave), step):
            clip = wave[offset:offset + step]
            if len(clip) < sample_rate // 4:
                continue
            result = pipe(
                {"raw": clip.astype(np.float32, copy=False), "sampling_rate": sample_rate},
                return_timestamps=False,
                generate_kwargs=self._generation(),
            )
            text = str(result.get("text") or "").strip()
            if not text:
                continue
            start = offset / sample_rate
            end = min(duration, (offset + len(clip)) / sample_rate)
            if end > start:
                out.append(Segment(round(start, 2), round(end, 2), text))
        if not out:
            raise ModelNotReady("PhoWhisper could not produce any transcript after its word-timestamp failure.")
        return out

    def transcribe(self, wave: np.ndarray, sample_rate: int, duration: float) -> list[Segment]:
        with self._lock:
            pipe = self._load()
            self.timing_mode = "word_aligned"
            self.alignment_warning = ""
            result = pipe(
                {"raw": wave.astype(np.float32, copy=False), "sampling_rate": sample_rate},
                return_timestamps="word",
                generate_kwargs=self._generation(),
            )
            try:
                segments = timestamped_asr_spans(result.get("chunks") or [], duration)
                if segments:
                    return segments
                raise ValueError("Whisper returned no timestamped words.")
            except (ValueError, TypeError) as exc:
                # Do not drop transcript or fabricate time-aligned words.
                # Re-run the *real model* on bounded audio clips instead.
                self.timing_mode = "audio_window"
                self.alignment_warning = "Whisper word alignment invalid: " + str(exc)
                return self._fallback_audio_windows(pipe, wave, sample_rate, duration)
