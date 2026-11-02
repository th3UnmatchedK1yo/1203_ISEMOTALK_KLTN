"""Adapter contracts. Real research code plugs in behind these; the HTTP layer never changes."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Optional, Protocol, Sequence

import numpy as np

EMOTIONS = ("neutral", "happy", "sad", "angry")


class ModelNotReady(Exception):
    """A requested real model cannot be used yet (missing checkpoint, unverified, deps not installed)."""


@dataclass
class Status:
    adapter: str
    ready: bool
    mock: bool
    detail: str
    verified: Optional[bool] = None

    def to_dict(self) -> dict:
        d = {"adapter": self.adapter, "ready": self.ready, "mock": self.mock, "detail": self.detail}
        if self.verified is not None:
            d["verified"] = self.verified
        return d


@dataclass
class Segment:
    start: float
    end: float
    text: str
    speaker: Optional[str] = None  # "agent" | "customer" | None (unknown)


@dataclass
class SerItem:
    id: str
    start: float
    end: float
    text: str
    speaker: str  # agent | customer | unknown


@dataclass
class SerOutput:
    """Class-probability vectors in the canonical EMOTIONS order. acoustic/lexical may be None."""

    fused: Sequence[float]
    acoustic: Optional[Sequence[float]] = None
    lexical: Optional[Sequence[float]] = None
    extra: dict = field(default_factory=dict)


# Returns the mono 16 kHz waveform for [start, end] of the utterance's own speaker channel when known.
AudioSlicer = Callable[[float, float, str], np.ndarray]


class AsrAdapter(Protocol):
    name: str
    mock: bool

    def status(self) -> Status: ...
    def transcribe(self, wave: np.ndarray, sample_rate: int, duration: float) -> list[Segment]: ...


class DiarizerAdapter(Protocol):
    name: str
    mock: bool

    def status(self) -> Status: ...
    def diarize(self, wave: np.ndarray, sample_rate: int, segments: list[Segment]) -> Optional[list[str]]:
        """Speaker per segment, or None when this adapter cannot decide (-> reviewer assigns manually)."""
        ...


class SerAdapter(Protocol):
    name: str
    mock: bool

    def status(self) -> Status: ...
    def predict(self, items: list[SerItem], audio: AudioSlicer) -> list[SerOutput]: ...


def normalize_probs(p: Sequence[float], what: str = "probabilities") -> list[float]:
    arr = [float(x) for x in p]
    if len(arr) != len(EMOTIONS) or any(not math.isfinite(x) or x < 0 for x in arr):
        raise ValueError(f"{what} must be {len(EMOTIONS)} finite non-negative numbers, got {arr!r}")
    total = sum(arr)
    if total <= 0:
        raise ValueError(f"{what} sum to zero")
    return [x / total for x in arr]


def to_prediction(p: Sequence[float]) -> dict:
    probs = normalize_probs(p)
    i = max(range(len(probs)), key=probs.__getitem__)
    return {"emotion": EMOTIONS[i], "confidence": round(probs[i], 4)}
