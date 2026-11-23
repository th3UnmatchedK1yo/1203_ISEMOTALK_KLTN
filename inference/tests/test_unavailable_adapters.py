"""Unavailable components remain explicitly non-mock and never invent output."""
import unittest

import numpy as np

from app.adapters.base import ModelNotReady, SerItem
from app.adapters.unavailable import UnavailableAsr, UnavailableSer


class UnavailableAdapterTests(unittest.TestCase):
    def test_asr_is_not_a_fake_transcript(self):
        adapter = UnavailableAsr()
        status = adapter.status()
        self.assertEqual(status.adapter, "not_configured")
        self.assertFalse(status.ready)
        self.assertFalse(status.mock)
        with self.assertRaises(ModelNotReady):
            adapter.transcribe(np.zeros(32000, dtype=np.float32), 16000, 2)

    def test_ser_does_not_fabricate_emotion_scores(self):
        adapter = UnavailableSer()
        status = adapter.status()
        self.assertFalse(status.ready)
        self.assertFalse(status.mock)
        with self.assertRaises(ModelNotReady):
            adapter.predict([SerItem("one", 0, 2, "xin chào", "unknown")],
                            lambda *_: np.zeros(32000, dtype=np.float32))


if __name__ == "__main__":
    unittest.main()
