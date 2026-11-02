"""Offline, cache-first Vietnamese ASR using faster-whisper/CTranslate2.

This is real speech recognition, but is NOT the PhoWhisper model used in the
research paper. It runs on CPU INT8 by default to conserve RTX 3050 VRAM and
does not download weights (local_files_only=True).
"""
from __future__ import annotations

import importlib.util
import threading
from pathlib import Path

import numpy as np

from .base import ModelNotReady, Segment, Status

_ALLOWED_PRESETS = {
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
}


def _resolve_cached_model(model_id: str) -> Path:
    """Find a complete *local* CTranslate2 model; network downloads are forbidden."""
    model_id = _ALLOWED_PRESETS.get(model_id.lower(), model_id)
    direct = Path(model_id).expanduser()
    if direct.is_dir():
        candidate = direct.resolve()
    elif "/" in model_id and not Path(model_id).is_absolute():
        try:
            from huggingface_hub import snapshot_download
            # No network, even if a repository ID was supplied.
            candidate = Path(snapshot_download(
                repo_id=model_id,
                local_files_only=True,
                allow_patterns=[
                    "config.json", "model.bin", "tokenizer.json",
                    "preprocessor_config.json", "vocabulary.*",
                ],
            ))
        except Exception as exc:
            raise ModelNotReady(
                f"Không tìm thấy model {model_id!r} trong Hugging Face cache. "
                "Kiểm tra cache hoặc cấu hình ISEMO_ASR_MODEL thành đường dẫn thư mục model.bin. "
                f"Chi tiết: {exc}"
            ) from exc
    else:
        raise ModelNotReady(
            "ISEMO_ASR_MODEL phải là 'small', 'medium', "
            "'Systran/faster-whisper-small', hoặc đường dẫn thư mục model đã có sẵn."
        )

    required = ("model.bin", "config.json", "tokenizer.json")
    missing = [name for name in required if not (candidate / name).is_file()]
    if missing:
        raise ModelNotReady(
            f"Cache model chưa đầy đủ tại {candidate} (thiếu {', '.join(missing)}). "
            "Không tự tải xuống; vui lòng kiểm tra cache."
        )
    return candidate


class FasterWhisperAsr:
    name = "faster_whisper"
    mock = False

    def __init__(self, model_id: str = "Systran/faster-whisper-small", device: str = "cpu") -> None:
        self.model_id = model_id
        self.device = 'cpu' if device == 'auto' else device
        self._model = None
        self._lock = threading.Lock()

    def status(self) -> Status:
        if importlib.util.find_spec("faster_whisper") is None:
            return Status(
                self.name, False, False,
                "Chưa cài faster-whisper trong inference/.venv. "
                "Dùng pip install --no-cache-dir faster-whisper sau khi kiểm tra dung lượng."
            )
        try:
            location = _resolve_cached_model(self.model_id)
        except ModelNotReady as exc:
            return Status(self.name, False, False, str(exc))
        return Status(
            self.name, True, False,
            f"CTranslate2 · {location.name} · {self.device} "
            f"({'đã nạp' if self._model is not None else 'offline, sẽ nạp khi dùng lần đầu'}). "
            "Đây là faster-whisper, KHÔNG phải PhoWhisper trong nghiên cứu."
        )

    def _load(self):
        if self._model is not None:
            return self._model
        if importlib.util.find_spec("faster_whisper") is None:
            raise ModelNotReady("Chưa cài faster-whisper trong inference/.venv.")
        folder = _resolve_cached_model(self.model_id)
        from faster_whisper import WhisperModel

        if self.device not in ("cpu", "cuda"):
            raise ModelNotReady("ISEMO_ASR_DEVICE cho faster-whisper chỉ nhận 'cpu' hoặc 'cuda'.")
        compute_type = "int8" if self.device == "cpu" else "int8_float16"
        try:
            self._model = WhisperModel(
                str(folder),
                device=self.device,
                compute_type=compute_type,
                local_files_only=True,
                num_workers=1,
            )
        except Exception as exc:
            raise ModelNotReady(
                f"Không nạp được faster-whisper từ cache bằng {self.device}/{compute_type}: {exc}. "
                "Nếu GPU thiếu CUDA/cuDNN DLL, dùng ISEMO_ASR_DEVICE=cpu."
            ) from exc
        return self._model

    def transcribe(self, wave: np.ndarray, sample_rate: int, duration: float) -> list[Segment]:
        if sample_rate != 16000:
            raise ValueError("FasterWhisperAsr expects already-normalized 16 kHz audio.")
        if wave.ndim != 1:
            raise ValueError("FasterWhisperAsr expects mono audio.")

        with self._lock:
            model = self._load()
            # Generator must be consumed before releasing lock.
            segments_iter, _ = model.transcribe(
                wave.astype(np.float32, copy=False),
                language="vi",
                task="transcribe",
                beam_size=3,
                vad_filter=duration >= 10.0,
                condition_on_previous_text=False,
            )
            raw = list(segments_iter)

        result: list[Segment] = []
        for item in raw:
            text = str(item.text or "").strip()
            start = max(0.0, float(item.start))
            end = min(float(duration), float(item.end))
            if text and start < end:
                result.append(Segment(round(start, 2), round(end, 2), text))
        return result
