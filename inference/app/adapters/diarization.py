"""Optional, *anonymous* real speaker diarization.

The speaker model answers WHEN voice A/B is heard, not WHICH voice is the
agent. Roles remain unknown until an authorized human verifies them.
Require an explicitly staged local Community-1 model: normal app startup
never downloads gated checkpoints, changes licenses, or invents identities.
"""
from __future__ import annotations

import importlib.util
import math
import os
import threading
from pathlib import Path
from typing import Optional

import numpy as np

from .base import ModelNotReady, Segment, Status


def _segments_from_pyannote(output, duration: float) -> list[dict]:
    """Normalize exclusive turn evidence, preserving uncertainty and bounds."""
    annotation = getattr(output, "exclusive_speaker_diarization", None)
    if annotation is None:
        annotation = getattr(output, "speaker_diarization", output)
    tracks = []
    if hasattr(annotation, "itertracks"):
        tracks = [(turn, speaker) for turn, _, speaker in annotation.itertracks(yield_label=True)]
    else:
        tracks = [(turn, speaker) for turn, speaker in annotation]
    ordered = sorted(tracks, key=lambda item: (float(item[0].start), float(item[0].end)))
    mapping: dict[str, str] = {}
    turns: list[dict] = []
    for turn, speaker in ordered:
        start, end = float(turn.start), float(turn.end)
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            raise ModelNotReady("Invalid time interval from speaker diarization model.")
        start, end = min(start, duration), min(end, duration)
        if end - start < 0.10:
            continue
        key = str(speaker)
        if key not in mapping:
            if len(mapping) >= 2:
                raise ModelNotReady("More than two speakers detected; this demo only supports two.")
            mapping[key] = "A" if not mapping else "B"
        turns.append({"start": round(start, 3), "end": round(end, 3), "speakerId": mapping[key]})
    return turns


class NoDiarizer:
    name = "none"
    mock = False

    def status(self) -> Status:
        return Status(self.name, True, False, "Ghi âm mono: chưa cấu hình tách giọng. Không tự gán nhãn Agent/Customer.")

    def diarize(self, wave: np.ndarray, sample_rate: int, segments: list[Segment]) -> Optional[list[str]]:
        return None


class PyannoteDiarizer:
    name = "pyannote-community-1"
    mock = False

    def __init__(self, hf_token: str = "") -> None:
        # No HF token is needed to *run* an approved model staged locally.
        # Do not retain or log a token; only staging uses HF credentials.
        del hf_token
        self.model_dir = Path(os.environ.get("ISEMO_DIARIZATION_MODEL_DIR", "")).expanduser()
        self.model_revision = os.environ.get("ISEMO_DIARIZATION_REVISION", "").strip()
        self.device = os.environ.get("ISEMO_DIARIZATION_DEVICE", "cpu").strip().lower()
        self._pipe = None
        self._lock = threading.Lock()
        self.speaker_turns: list[dict] = []

    def status(self) -> Status:
        if importlib.util.find_spec("pyannote") is None:
            return Status(self.name, False, False, "Chưa cài pyannote.audio trong môi trường inference.")
        if not self.model_dir.is_absolute() or not (self.model_dir / "config.yaml").is_file():
            return Status(self.name, False, False, "Chưa stage checkpoint Community-1 cục bộ (ISEMO_DIARIZATION_MODEL_DIR).")
        if self.device not in ("cpu", "cuda"):
            return Status(self.name, False, False, "ISEMO_DIARIZATION_DEVICE phải là cpu hoặc cuda.")
        return Status(self.name, True, False, "Community-1 từ checkpoint cục bộ · tách giọng A/B, KHÔNG suy ra Agent/Customer",
                      loaded=self._pipe is not None)

    def _load(self):
        if self._pipe is None:
            state = self.status()
            if not state.ready:
                raise ModelNotReady(state.detail)
            from pyannote.audio import Pipeline
            import torch
            if self.device == "cuda" and not torch.cuda.is_available():
                raise ModelNotReady("pyannote được yêu cầu chạy GPU nhưng CUDA chưa sẵn sàng.")
            try:
                pipe = Pipeline.from_pretrained(str(self.model_dir.resolve()))
                pipe.to(torch.device(self.device))
                self._pipe = pipe
            except Exception as exc:
                raise ModelNotReady("Community-1 local checkpoint could not load: " + str(exc)) from exc
        return self._pipe

    def diarize(self, wave: np.ndarray, sample_rate: int, segments: list[Segment]) -> Optional[list[str]]:
        if sample_rate != 16000:
            raise ModelNotReady("Community-1 expects 16 kHz mono audio.")
        if wave.ndim != 1 or len(wave) == 0 or not np.isfinite(wave).all():
            raise ModelNotReady("Diarization received invalid mono waveform.")
        import torch

        with self._lock:
            self.speaker_turns = []  # never leak the prior call's speaker metadata
            pipe = self._load()
            try:
                output = pipe(
                    {"waveform": torch.from_numpy(np.asarray(wave, dtype=np.float32)).unsqueeze(0),
                     "sample_rate": sample_rate},
                    min_speakers=1, max_speakers=2,
                )
                self.speaker_turns = _segments_from_pyannote(output, len(wave) / sample_rate)
            except ModelNotReady:
                raise
            except Exception as exc:
                raise ModelNotReady("Speaker diarization inference failed: " + str(exc)) from exc
            # Anonymous voice groups are real evidence; assigning actual roles
            # without a reference voice/channel is NOT. Leave reviewer fields unknown.
            return ["unknown"] * len(segments)
