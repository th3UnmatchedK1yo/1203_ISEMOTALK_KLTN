"""Audio helpers built on ffmpeg/ffprobe (so WAV, MP3 and M4A all work without extra Python deps)."""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np


class AudioError(Exception):
    """The file cannot be decoded (corrupt, wrong format, ffmpeg missing)."""


@dataclass(frozen=True)
class AudioInfo:
    duration: float
    channels: int
    sample_rate: int


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _run(cmd: list[str], timeout: int = 900) -> bytes:
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except FileNotFoundError as e:
        raise AudioError("Không tìm thấy ffmpeg. Hãy cài ffmpeg và thêm vào PATH.") from e
    except subprocess.TimeoutExpired as e:
        raise AudioError("Giải mã âm thanh quá lâu (hết thời gian chờ).") from e
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-1:] or ["lỗi không rõ"]
        raise AudioError(f"Không đọc được tệp âm thanh (tệp hỏng hoặc sai định dạng): {tail[0]}")
    return proc.stdout


def probe(path: Path) -> AudioInfo:
    out = _run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=channels,sample_rate:format=duration",
            "-of", "json", str(path),
        ],
        timeout=60,
    )
    data = json.loads(out or b"{}")
    streams = data.get("streams") or []
    if not streams:
        raise AudioError("Tệp không chứa luồng âm thanh.")
    try:
        duration = float(data["format"]["duration"])
    except (KeyError, TypeError, ValueError) as e:
        raise AudioError("Không xác định được thời lượng của tệp âm thanh.") from e
    try:
        channels, rate = int(streams[0]["channels"]), int(streams[0]["sample_rate"])
    except (KeyError, TypeError, ValueError) as e:
        raise AudioError("Thông tin kênh/tần số âm thanh không hợp lệ.") from e
    if not math.isfinite(duration) or duration <= 0 or channels <= 0 or rate <= 0:
        raise AudioError("Thời lượng/kênh/tần số âm thanh không hợp lệ.")
    return AudioInfo(duration, channels, rate)


def decode(path: Path, sample_rate: int = 16000, channels: int = 1, *, max_bytes: int = 256 * 1024 * 1024) -> np.ndarray:
    """Returns float32 samples in [-1, 1]; shape (n,) for mono or (n, channels)."""
    if sample_rate <= 0 or channels not in (1, 2) or max_bytes <= 0:
        raise AudioError("Giới hạn giải mã không hợp lệ.")
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-map", "0:a:0", "-vn",
           "-ac", str(channels), "-ar", str(sample_rate), "-f", "f32le", "-"]
    # Read at most the budget + one sentinel byte; never buffer unbounded PCM.
    # stderr goes to a temporary file so a full pipe cannot deadlock stdout.
    with tempfile.TemporaryFile() as errors:
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errors)
        except FileNotFoundError as e:
            raise AudioError("Không tìm thấy ffmpeg trong PATH.") from e
        timed_out = threading.Event()
        def expire():
            timed_out.set()
            proc.kill()
        timer = threading.Timer(900, expire)
        timer.daemon = True
        timer.start()
        try:
            raw = proc.stdout.read(max_bytes + 1)
            if len(raw) > max_bytes:
                raise AudioError("Âm thanh sau giải mã vượt giới hạn bộ nhớ. Hãy chia thành các đoạn ngắn hơn.")
            code = proc.wait()
            if timed_out.is_set():
                raise AudioError("Giải mã âm thanh quá lâu (hết thời gian chờ).")
            if code:
                errors.seek(max(0, errors.tell() - 4096))
                detail = errors.read().decode("utf-8", "replace").strip().splitlines()[-1:]
                raise AudioError("Không giải mã được âm thanh: " + (detail[0] if detail else "tệp không hợp lệ"))
        finally:
            timer.cancel()
            if proc.poll() is None:
                proc.kill()
            proc.wait()
            proc.stdout.close()
    if len(raw) % (4 * channels):
        raise AudioError("Dữ liệu âm thanh sau giải mã không đầy đủ.")
    wave = np.frombuffer(raw, dtype=np.float32)
    if wave.size == 0:
        raise AudioError("Tệp âm thanh không có dữ liệu.")
    return wave if channels == 1 else wave.reshape(-1, channels)


def peaks(wave_mono: np.ndarray, bins: int = 400) -> list[float]:
    """Normalised (0..1) per-bin peak amplitude, used to draw the waveform."""
    if wave_mono.size == 0:
        return [0.0] * bins
    edges = np.linspace(0, wave_mono.size, bins + 1, dtype=int)
    out = np.array(
        [np.abs(wave_mono[a:b]).max() if b > a else 0.0 for a, b in zip(edges[:-1], edges[1:])],
        dtype=np.float64,
    )
    top = out.max()
    return [round(float(v), 3) for v in (out / top if top > 0 else out)]


def channel_split_is_reliable(stereo: np.ndarray) -> bool:
    """True only when the two channels really carry different speakers.

    Dual-mono files (identical channels) and mono audio stored in a stereo container
    (one silent channel) must NOT be treated as speaker-separated.
    """
    if stereo.ndim != 2 or stereo.shape[1] < 2:
        return False
    if len(stereo) == 0:
        return False
    # A bounded, evenly spaced sample makes this channel heuristic independent
    # of call length. It detects dual-mono/silence, not speaker identity.
    sample = stereo[np.linspace(0, len(stereo) - 1, min(len(stereo), 64000), dtype=int)]
    left, right = sample[:, 0].astype(np.float64), sample[:, 1].astype(np.float64)
    rms_l, rms_r = float(np.sqrt(np.mean(left**2))), float(np.sqrt(np.mean(right**2)))
    if min(rms_l, rms_r) < 0.01 * max(rms_l, rms_r, 1e-9):
        return False  # one side is (almost) silent
    corr = float(np.corrcoef(left, right)[0, 1]) if left.std() > 0 and right.std() > 0 else 1.0
    return abs(corr) < 0.95
