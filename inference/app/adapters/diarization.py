"""Optional, *anonymous* real speaker diarization.

The speaker model answers WHEN voice A/B is heard, not WHICH voice is the
agent. Roles remain unknown until an authorized human verifies them.
Require an explicitly staged local Community-1 model: normal app startup
never downloads gated checkpoints, changes licenses, or invents identities.
"""
from __future__ import annotations

import importlib.util
import json
import math
import os
import subprocess
import tempfile
import threading
import wave
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
        self.worker_python = os.environ.get("ISEMO_DIARIZATION_WORKER_PYTHON", "").strip()
        self._pipe = None
        self._lock = threading.Lock()
        self.speaker_turns: list[dict] = []

    def status(self) -> Status:
        if not self.worker_python and importlib.util.find_spec("pyannote") is None:
            return Status(self.name, False, False, "Chưa có pyannote.audio; có thể dùng worker Python riêng.")
        if self.worker_python and not Path(self.worker_python).is_file():
            return Status(self.name, False, False, "Pyannote worker Python riêng không tồn tại.")
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

    def _run_isolated(self, samples: np.ndarray, sample_rate: int) -> list[dict]:
        """No GPU residency in Node's long-lived Python inference process."""
        root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(prefix="isemotalk-diar-") as directory:
            wav = Path(directory) / "audio.wav"
            with wave.open(str(wav), "wb") as handle:
                handle.setnchannels(1)
                handle.setsampwidth(2)
                handle.setframerate(sample_rate)
                pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
                handle.writeframes(pcm.tobytes())
            env = dict(os.environ, HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1",
                       PYTHONPATH=str(root))
            try:
                job = subprocess.run([
                    self.worker_python, "-m", "app.pyannote_worker",
                    "--wav", str(wav), "--model-dir", str(self.model_dir.resolve()),
                    "--device", self.device,
                ], cwd=str(root), env=env, capture_output=True, text=True,
                    timeout=15 * 60, check=False)
            except subprocess.TimeoutExpired as exc:
                raise ModelNotReady("Diarization worker exceeded 15 minute safety timeout.") from exc
            if job.returncode != 0:
                raise ModelNotReady("Isolated diarization worker failed: " + job.stderr[-400:])
            try:
                turns = json.loads(job.stdout)["turns"]
            except (ValueError, KeyError, TypeError) as exc:
                raise ModelNotReady("Isolated diarization worker returned invalid JSON.") from exc
            if not isinstance(turns, list) or len(turns) > 15000:
                raise ModelNotReady("Isolated diarization returned invalid or excessive speaker turns.")
            duration = len(samples) / sample_rate
            for t in turns:
                if not isinstance(t, dict) or t.get("speakerId") not in ("A", "B") or not (
                    isinstance(t.get("start"), (int, float)) and isinstance(t.get("end"), (int, float))
                    and 0 <= t["start"] < t["end"] <= duration + .05
                ):
                    raise ModelNotReady("Isolated diarization returned a malformed turn.")
            return turns

    def diarize(self, wave: np.ndarray, sample_rate: int, segments: list[Segment]) -> Optional[list[str]]:
        if sample_rate != 16000:
            raise ModelNotReady("Community-1 expects 16 kHz mono audio.")
        if wave.ndim != 1 or len(wave) == 0 or not np.isfinite(wave).all():
            raise ModelNotReady("Diarization received invalid mono waveform.")
        import torch

        with self._lock:
            self.speaker_turns = []  # never leak the prior call's speaker metadata
            try:
                if self.worker_python:
                    if not self.status().ready:
                        raise ModelNotReady(self.status().detail)
                    self.speaker_turns = self._run_isolated(wave, sample_rate)
                else:
                    pipe = self._load()
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
