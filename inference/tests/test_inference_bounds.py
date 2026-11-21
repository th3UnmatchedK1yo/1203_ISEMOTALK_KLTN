from __future__ import annotations

import concurrent.futures
from dataclasses import replace
import tempfile
import threading
import tracemalloc
import unittest
import wave
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

import numpy as np
from pydantic import ValidationError

from app import audio
from app.adapters.base import normalize_probs
from app.adapters.mock import MockAsr, MockDiarizer, MockSer
from app.adapters.diarization import PyannoteDiarizer
from app.adapters.base import Segment
from app.config import Settings
from app.main import SegmentIn
from app.service import InferenceService


class InferenceBoundsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.path = self.root / "test.wav"
        with wave.open(str(self.path), "wb") as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(16000)
            f.writeframes(b"\x00\x00" * 16000)
        self.svc = InferenceService(replace(Settings.load(), uploads_dir=self.root), MockAsr(), MockDiarizer(), MockSer())

    def test_rejects_over_limit_duration_before_decode(self):
        with patch("app.audio.probe", return_value=audio.AudioInfo(1e6, 2, 16000)), patch("app.audio.decode") as decoder:
            with self.assertRaises(audio.AudioError):
                self.svc.probe(str(self.path))
            decoder.assert_not_called()

    def test_stereo_pcm_budget_is_checked_before_decode(self):
        with patch("app.audio.probe", return_value=audio.AudioInfo(10800, 2, 16000)), patch("app.audio.decode") as decoder:
            with self.assertRaises(audio.AudioError):
                self.svc.probe(str(self.path))
            decoder.assert_not_called()

    def test_stereo_statistics_keep_temporary_memory_bounded(self):
        stereo = np.ones((1_000_000, 2), dtype=np.float32)
        tracemalloc.start()
        try:
            self.assertFalse(audio.channel_split_is_reliable(stereo))
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        self.assertLess(peak, 8 * 1024 * 1024)

    def test_rejects_nonfinite_metadata_before_decode(self):
        for duration in (float("nan"), float("inf"), -1):
            with self.subTest(duration=duration), patch("app.audio.probe", return_value=audio.AudioInfo(duration, 1, 16000)), patch("app.audio.decode") as decoder:
                with self.assertRaises(audio.AudioError):
                    self.svc.probe(str(self.path))
                decoder.assert_not_called()

    def test_decode_byte_cap_rejects_without_returning_truncated_audio(self):
        with self.assertRaises(audio.AudioError):
            audio.decode(self.path, max_bytes=16000)

    def test_concurrent_same_file_decode_runs_once(self):
        entered, release = threading.Event(), threading.Event()
        actual_decode = audio.decode
        count = []
        def delayed(*args, **kwargs):
            count.append(1); entered.set(); release.wait(2)
            return actual_decode(*args, **kwargs)
        with patch("app.audio.decode", side_effect=delayed):
            with concurrent.futures.ThreadPoolExecutor(2) as pool:
                one = pool.submit(self.svc.probe, str(self.path))
                self.assertTrue(entered.wait(2))
                two = pool.submit(self.svc.probe, str(self.path))
                release.set()
                self.assertEqual(one.result(), two.result())
        self.assertEqual(len(count), 1)

    def test_intervals_must_be_finite_and_ordered(self):
        for start, end in ((2, 1), (1, 1), (float("inf"), float("inf")), (0, float("nan"))):
            with self.subTest(start=start, end=end), self.assertRaises(ValidationError):
                SegmentIn(start=start, end=end)

    def test_segment_after_audio_is_rejected(self):
        with self.assertRaises(audio.AudioError):
            self.svc.emotion(str(self.path), [{"id": "one", "start": 2, "end": 3, "text": "test"}], 0)

    def test_probability_scores_must_be_probabilities(self):
        for values in ([1e308, 1e308, 0, 0], [2, 1, 1, 1], [0.2]*4, [float("nan"), 0, 0, 1]):
            with self.subTest(values=values), self.assertRaises(ValueError):
                normalize_probs(values)
        self.assertEqual(normalize_probs([0.1, 0.2, 0.3, 0.4]), [0.1, 0.2, 0.3, 0.4])

    def test_completed_stage_evidence_names_actual_adapter(self):
        result = self.svc.transcribe(str(self.path), 0)
        self.assertEqual(result["evidence"]["adapter"], "mock")
        self.assertTrue(result["evidence"]["mock"])

    def test_utterance_slicing_does_not_add_unrequested_surrounding_speech(self):
        captured = []
        class CaptureSer(MockSer):
            def predict(self, items, slicer):
                captured.extend(slicer(item.start, item.end, item.speaker).size for item in items)
                return super().predict(items, slicer)
        self.svc.ser = CaptureSer()
        self.svc.emotion(str(self.path), [{"id": "one", "start": 0.2, "end": 0.3, "text": "test"}], 0)
        self.assertEqual(captured, [1600])

    def test_first_anonymous_speaker_does_not_establish_agent_role(self):
        diarizer = PyannoteDiarizer("synthetic-test-token")
        turn = SimpleNamespace(start=0, end=1)
        result = SimpleNamespace(itertracks=lambda **kwargs: iter([(turn, None, "SPEAKER_00")]))
        tensor = SimpleNamespace(unsqueeze=lambda *_: object())
        with patch.object(diarizer, "_load", return_value=lambda *args, **kwargs: result), patch.dict("sys.modules", {"torch": SimpleNamespace(from_numpy=lambda *_: tensor)}):
            roles = diarizer.diarize(np.zeros(16000), 16000, [Segment(0, 1, "Xin chào")])
        self.assertEqual(roles, ["unknown"])


if __name__ == "__main__":
    unittest.main()
