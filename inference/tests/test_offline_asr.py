"""Tests for offline ASR integration; no checkpoint downloads or GPU required."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from app.adapters.asr_faster_whisper import FasterWhisperAsr, _resolve_cached_model
from app.adapters.base import ModelNotReady
from app.config import Settings


class FakeModel:
    def __init__(self):
        self.kwargs = None

    def transcribe(self, wave, **kwargs):
        self.kwargs = kwargs
        return iter([
            SimpleNamespace(start=0.0, end=0.9, text=" Xin chào "),
            SimpleNamespace(start=0.9, end=3.5, text=" Cảm ơn "),
            SimpleNamespace(start=1.5, end=1.6, text="   "),
        ]), None


class TestOfflineASR(unittest.TestCase):
    def test_requires_complete_local_ctranslate2_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "model.bin").write_bytes(b"placeholder")
            (root / "config.json").write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ModelNotReady, "tokenizer.json"):
                _resolve_cached_model(str(root))
            (root / "tokenizer.json").write_text("{}", encoding="utf-8")
            self.assertEqual(_resolve_cached_model(str(root)), root.resolve())

    def test_missing_or_invalid_model_is_explained(self):
        with self.assertRaisesRegex(ModelNotReady, "ISEMO_ASR_MODEL"):
            _resolve_cached_model("not-a-model")

    def test_auto_device_is_cpu_not_cuda(self):
        self.assertEqual(FasterWhisperAsr("small", "auto").device, "cpu")

    def test_real_asr_mode_preserves_phowhisper_alternative(self):
        with patch.dict("os.environ", {
            "ISEMO_MODE": "mock",
            "ISEMO_ASR": "faster_whisper",
            "ISEMO_SER": "mock",
            "ISEMO_DIARIZATION": "none",
        }):
            settings = Settings.load()
        self.assertEqual(settings.asr, "faster_whisper")
        self.assertEqual(settings.asr_model, "Systran/faster-whisper-small")
        self.assertEqual(settings.asr_device, "cpu")

    def test_streaming_segments_are_consumed_and_clamped(self):
        model = FakeModel()
        asr = FasterWhisperAsr("small", "cpu")
        asr._model = model
        result = asr.transcribe(np.zeros(32000, dtype=np.float32), 16000, 2.0)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0].text, "Xin chào")
        self.assertEqual(result[1].end, 2.0)
        self.assertEqual(model.kwargs["language"], "vi")
        self.assertEqual(model.kwargs["task"], "transcribe")
        self.assertEqual(model.kwargs["vad_filter"], False)

    def test_refuse_wrong_sample_rate(self):
        asr = FasterWhisperAsr("small", "cpu")
        with self.assertRaisesRegex(ValueError, "16 kHz"):
            asr.transcribe(np.zeros(16, dtype=np.float32), 8000, 1.0)

    def test_no_download_on_cached_snapshot_lookup(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ("config.json", "model.bin", "tokenizer.json"):
                (root / name).write_bytes(b"test")
            seen = {}

            def fake_snapshot_download(**kwargs):
                seen.update(kwargs)
                return str(root)

            with patch.dict("sys.modules", {"huggingface_hub": SimpleNamespace(
                snapshot_download=fake_snapshot_download
            )}):
                result = _resolve_cached_model("Systran/faster-whisper-small")
            self.assertEqual(result, root)
            self.assertTrue(seen.get("local_files_only"))
            self.assertEqual(seen.get("repo_id"), "Systran/faster-whisper-small")


if __name__ == "__main__":
    unittest.main()
