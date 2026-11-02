"""Builds the adapter set from settings."""
from __future__ import annotations

from ..config import Settings
from .base import AsrAdapter, DiarizerAdapter, SerAdapter
from .asr_phowhisper import PhoWhisperAsr
from .diarization import NoDiarizer, PyannoteDiarizer
from .mock import MockAsr, MockDiarizer, MockSer
from .ser_checkpoint import CheckpointSer


def build_asr(s: Settings) -> AsrAdapter:
    if s.asr == "mock":
        return MockAsr()
    if s.asr == "phowhisper":
        return PhoWhisperAsr(s.asr_model, s.asr_device)
    raise ValueError(f"ISEMO_ASR không hợp lệ: {s.asr!r} (mock | phowhisper)")


def build_diarizer(s: Settings) -> DiarizerAdapter:
    if s.diarization == "mock":
        return MockDiarizer()
    if s.diarization == "none":
        return NoDiarizer()
    if s.diarization == "pyannote":
        return PyannoteDiarizer(s.hf_token)
    raise ValueError(f"ISEMO_DIARIZATION không hợp lệ: {s.diarization!r} (mock | none | pyannote)")


def build_ser(s: Settings) -> SerAdapter:
    if s.ser == "mock":
        return MockSer()
    if s.ser == "checkpoint":
        return CheckpointSer(s.ser_factory, s.ser_config, s.allow_unverified)
    raise ValueError(f"ISEMO_SER không hợp lệ: {s.ser!r} (mock | checkpoint)")
