"""Speaker assignment.

Stereo recordings with genuinely separate channels are handled in the service layer (channel =
speaker), which is the only reliable option. This module covers MONO audio:

* NoDiarizer  - honest default: says "I can't tell", the reviewer assigns speakers by hand.
* PyannoteDiarizer - optional model-based diarization (needs `pyannote.audio` + a Hugging Face token).
  The two anonymous speakers are mapped to agent/customer by "who speaks first is the agent",
  which is a heuristic - the UI marks such results as model-assigned so reviewers can correct them.
"""
from __future__ import annotations

import importlib.util
import threading
from typing import Optional

import numpy as np

from .base import ModelNotReady, Segment, Status


class NoDiarizer:
    name = "none"
    mock = False

    def status(self) -> Status:
        return Status(self.name, True, False, "Ghi âm mono: không có mô hình tách người nói — gán thủ công khi xem xét.")

    def diarize(self, wave: np.ndarray, sample_rate: int, segments: list[Segment]) -> Optional[list[str]]:
        return None


class PyannoteDiarizer:
    name = "pyannote"
    mock = False

    def __init__(self, hf_token: str) -> None:
        self.hf_token = hf_token
        self._pipe = None
        self._lock = threading.Lock()

    def status(self) -> Status:
        if importlib.util.find_spec("pyannote") is None:
            return Status(self.name, False, False, "Chưa cài pyannote.audio (pip install pyannote.audio).")
        if not self.hf_token:
            return Status(self.name, False, False, "Thiếu ISEMO_HF_TOKEN (token Hugging Face, đã chấp nhận điều khoản mô hình).")
        return Status(self.name, True, False, "pyannote/speaker-diarization-3.1")

    def _load(self):
        if self._pipe is None:
            st = self.status()
            if not st.ready:
                raise ModelNotReady(st.detail)
            from pyannote.audio import Pipeline

            try:
                self._pipe = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=self.hf_token)
            except Exception as e:
                raise ModelNotReady(f"Không nạp được pyannote: {e}") from e
        return self._pipe

    def diarize(self, wave: np.ndarray, sample_rate: int, segments: list[Segment]) -> Optional[list[str]]:
        import torch

        with self._lock:
            pipe = self._load()
            result = pipe({"waveform": torch.from_numpy(wave).unsqueeze(0), "sample_rate": sample_rate}, num_speakers=2)
        turns = [(t.start, t.end, spk) for t, _, spk in result.itertracks(yield_label=True)]
        if not turns:
            return None
        first = min(turns, key=lambda t: t[0])[2]  # whoever speaks first = agent (heuristic)
        out = []
        for seg in segments:
            overlap: dict[str, float] = {}
            for s, e, spk in turns:
                o = min(seg.end, e) - max(seg.start, s)
                if o > 0:
                    overlap[spk] = overlap.get(spk, 0.0) + o
            if not overlap:
                out.append("unknown")
            else:
                spk = max(overlap, key=overlap.get)
                out.append("agent" if spk == first else "customer")
        return out
