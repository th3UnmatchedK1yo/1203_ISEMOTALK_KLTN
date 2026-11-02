"""Orchestration: turns files + adapters into the normalised results the Express backend expects."""
from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

from . import audio
from .adapters.base import (
    AsrAdapter, DiarizerAdapter, Segment, SerAdapter, SerItem, to_prediction,
)
from .config import Settings


class PathNotAllowed(Exception):
    pass


@dataclass
class Loaded:
    info: audio.AudioInfo
    mono: np.ndarray
    stereo: Optional[np.ndarray]  # only when 2 channels were decoded
    split_reliable: bool


class InferenceService:
    def __init__(self, settings: Settings, asr: AsrAdapter, diarizer: DiarizerAdapter, ser: SerAdapter) -> None:
        self.s = settings
        self.asr, self.diarizer, self.ser = asr, diarizer, ser
        self._cache_key: Optional[tuple] = None
        self._cache: Optional[Loaded] = None
        self._lock = threading.Lock()

    # -- files ------------------------------------------------------------------
    def resolve(self, raw: str) -> Path:
        p = Path(raw).expanduser().resolve()
        root = self.s.uploads_dir
        if root != p and root not in p.parents:
            raise PathNotAllowed("Đường dẫn nằm ngoài thư mục tải lên được phép.")
        if not p.is_file():
            raise audio.AudioError("Không tìm thấy tệp âm thanh trên máy chủ suy luận.")
        return p

    def _load(self, p: Path) -> Loaded:
        key = (str(p), p.stat().st_mtime_ns)
        with self._lock:
            if self._cache_key == key and self._cache is not None:
                return self._cache
        info = audio.probe(p)
        sr = self.s.sample_rate
        if info.channels == 2:
            stereo = audio.decode(p, sr, 2)
            loaded = Loaded(info, stereo.mean(axis=1).astype(np.float32), stereo, audio.channel_split_is_reliable(stereo))
        else:
            loaded = Loaded(info, audio.decode(p, sr, 1), None, False)
        with self._lock:
            self._cache_key, self._cache = key, loaded
        return loaded

    def _speaker_wave(self, loaded: Loaded, speaker: str, agent_channel: int) -> np.ndarray:
        if loaded.split_reliable and loaded.stereo is not None and speaker in ("agent", "customer"):
            ch = agent_channel if speaker == "agent" else 1 - agent_channel
            return loaded.stereo[:, ch]
        return loaded.mono

    # -- endpoints --------------------------------------------------------------
    def probe(self, raw: str) -> dict:
        p = self.resolve(raw)
        loaded = self._load(p)
        return {
            "duration": round(loaded.info.duration, 3),
            "channels": loaded.info.channels,
            "sampleRate": loaded.info.sample_rate,
            "peaks": audio.peaks(loaded.mono),
        }

    def transcribe(self, raw: str, agent_channel: int) -> dict:
        loaded = self._load(self.resolve(raw))
        sr, duration = self.s.sample_rate, loaded.info.duration
        segments: list[Segment] = []
        if loaded.split_reliable and loaded.stereo is not None and not self.asr.mock:
            for ch in (0, 1):
                speaker = "agent" if ch == agent_channel else "customer"
                for seg in self.asr.transcribe(loaded.stereo[:, ch], sr, duration):
                    seg.speaker = speaker
                    segments.append(seg)
            speaker_source = "channel"
        else:
            segments = self.asr.transcribe(loaded.mono, sr, duration)
            speaker_source = "mock" if self.asr.mock else "none"
        segments = sorted((s for s in segments if s.text.strip() and s.end > s.start), key=lambda s: (s.start, s.end))
        return {
            "segments": [
                {"start": s.start, "end": s.end, "text": s.text.strip(), **({"speaker": s.speaker} if s.speaker else {})}
                for s in segments
            ],
            "speakerSource": speaker_source,
            "provenance": "mock" if self.asr.mock else "real",
        }

    def diarize(self, raw: str, segs: list[dict]) -> dict:
        loaded = self._load(self.resolve(raw))
        segments = [Segment(float(s["start"]), float(s["end"]), s.get("text", "")) for s in segs]
        speakers = self.diarizer.diarize(loaded.mono, self.s.sample_rate, segments)
        if speakers is None:
            return {"speakers": [], "method": "none", "detail": self.diarizer.status().detail}
        return {"speakers": speakers, "method": "mock" if self.diarizer.mock else "model"}

    def emotion(self, raw: str, utterances: list[dict], agent_channel: int) -> dict:
        loaded = self._load(self.resolve(raw))
        sr = self.s.sample_rate

        def slicer(start: float, end: float, speaker: str) -> np.ndarray:
            wave = self._speaker_wave(loaded, speaker, agent_channel)
            i0, i1 = int(max(0.0, start) * sr), int(min(end, loaded.info.duration) * sr)
            min_len = int(0.3 * sr)  # very short clips are padded with surrounding audio
            if i1 - i0 < min_len:
                pad = (min_len - (i1 - i0)) // 2 + 1
                i0, i1 = max(0, i0 - pad), min(len(wave), i1 + pad)
            return wave[i0:max(i1, i0 + 1)]

        items = [SerItem(u["id"], float(u["start"]), float(u["end"]), u.get("text", ""), u.get("speaker", "unknown")) for u in utterances]
        outs = self.ser.predict(items, slicer)
        if len(outs) != len(items):
            raise RuntimeError(f"Mô hình trả {len(outs)} kết quả cho {len(items)} câu.")
        return {
            "provenance": "mock" if self.ser.mock else "real",
            "predictions": [
                {
                    "id": it.id,
                    "acoustic": to_prediction(o.acoustic) if o.acoustic is not None else None,
                    "lexical": to_prediction(o.lexical) if o.lexical is not None else None,
                    "fused": to_prediction(o.fused),
                }
                for it, o in zip(items, outs)
            ],
        }

    # -- health -----------------------------------------------------------------
    def device(self) -> str:
        import importlib.util

        if self.asr.name == "faster_whisper":
            # CTranslate2-based ASR does not need PyTorch. A separate SER
            # checkpoint adapter may still need torch later.
            asr_device = getattr(self.asr, "device", "cpu")
            return f"{asr_device} (CTranslate2 ASR, không yêu cầu PyTorch)"

        if importlib.util.find_spec("torch") is None:
            return "cpu (chưa cài torch)"
        import torch

        return f"cuda:0 · {torch.cuda.get_device_name(0)}" if torch.cuda.is_available() else "cpu (PyTorch không thấy GPU)"

    def health(self) -> dict:
        comps = {"asr": self.asr.status(), "diarization": self.diarizer.status(), "ser": self.ser.status()}
        mocks = [c.mock for c in comps.values()]
        mode = "mock" if all(mocks) else "real" if not any(mocks) else "mixed"
        ok = audio.ffmpeg_available() and all(c.ready for c in comps.values())
        return {
            "status": "ok" if ok else "degraded",
            "mode": mode,
            "device": self.device(),
            "ffmpeg": audio.ffmpeg_available(),
            "components": {k: v.to_dict() for k, v in comps.items()},
        }
