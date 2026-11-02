"""Runtime configuration, read from environment variables (and an optional inference/.env file).

Every component defaults to MOCK. Nothing becomes "real" unless you ask for it explicitly.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # .../inference


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(ROOT / ".env")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(f"ISEMO_{name}", default).strip()


@dataclass(frozen=True)
class Settings:
    # mock | real. "real" selects phowhisper + stereo + checkpoint unless a component is overridden.
    mode: str
    asr: str  # mock | phowhisper | faster_whisper
    diarization: str  # mock | none | pyannote
    ser: str  # mock | checkpoint
    # Only audio under this directory may be read (the Express backend's upload folder).
    uploads_dir: Path
    asr_model: str
    asr_device: str  # auto | cpu | cuda
    ser_factory: str  # "package.module:function" supplied by the research code
    ser_config: str  # JSON file passed to the factory (checkpoint paths, labels, ...)
    allow_unverified: bool
    hf_token: str
    sample_rate: int = 16000

    @staticmethod
    def load() -> "Settings":
        mode = _env("MODE", "mock").lower()
        real = mode == "real"
        asr_kind = _env("ASR", "phowhisper" if real else "mock").lower()
        return Settings(
            mode=mode,
            asr=asr_kind,
            diarization=_env("DIARIZATION", "none" if real else "mock").lower(),
            ser=_env("SER", "checkpoint" if real else "mock").lower(),
            uploads_dir=Path(_env("UPLOADS_DIR", str((ROOT.parent / "server" / "data" / "uploads"))))
            .expanduser()
            .resolve(),
            asr_model=_env("ASR_MODEL", "Systran/faster-whisper-small" if asr_kind in ("faster_whisper", "faster-whisper") else "vinai/PhoWhisper-small"),
            asr_device=_env("ASR_DEVICE", "cpu" if asr_kind in ("faster_whisper", "faster-whisper") else "auto").lower(),
            ser_factory=_env("SER_FACTORY"),
            ser_config=_env("SER_CONFIG"),
            allow_unverified=_env("ALLOW_UNVERIFIED", "0") in ("1", "true", "yes"),
            hf_token=_env("HF_TOKEN") or os.environ.get("HF_TOKEN", ""),
        )
