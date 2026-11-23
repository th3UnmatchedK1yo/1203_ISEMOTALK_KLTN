"""PhoWhisper ASR segmentation regression: pure CPU fake-pipeline tests."""
import unittest

import numpy as np

from app.adapters.asr_phowhisper import PhoWhisperAsr
from app.adapters.base import ModelNotReady
from app.asr_segments import timestamped_asr_spans


class FakePipe:
    def __init__(self, chunks):
        self.chunks = chunks
        self.kwargs = None

    def __call__(self, audio, **kwargs):
        self.kwargs = kwargs
        return {"chunks": self.chunks}


class TestWordAlignedSegments(unittest.TestCase):
    def test_split_by_silence_without_guessing_speaker(self):
        chunks = [
            {"text": " Xin", "timestamp": (0.1, 0.5)},
            {"text": " chào.", "timestamp": (0.6, 1.3)},
            {"text": " Tôi", "timestamp": (2.3, 2.6)},
            {"text": " cần", "timestamp": (2.65, 2.9)},
            {"text": " hỗ", "timestamp": (2.95, 3.2)},
            {"text": " trợ.", "timestamp": (3.25, 3.9)},
        ]
        segments = timestamped_asr_spans(chunks, 5.0)
        self.assertEqual([s.text for s in segments], ["Xin chào.", "Tôi cần hỗ trợ."])
        self.assertEqual([(s.start, s.end) for s in segments], [(0.1, 1.3), (2.3, 3.9)])
        self.assertTrue(all(s.speaker is None for s in segments))

    def test_time_cap_splits_long_stream_without_fabricated_times(self):
        chunks = [{"text": " từ", "timestamp": (i * 0.7, i * 0.7 + 0.4)} for i in range(38)]
        segments = timestamped_asr_spans(chunks, 27.0)
        self.assertGreaterEqual(len(segments), 2)
        self.assertEqual(segments[0].start, 0.0)
        self.assertLessEqual(segments[0].end, 12.4)
        self.assertLessEqual(segments[-1].end, 27.0)

    def test_no_invented_alignment_on_invalid_chunk(self):
        with self.assertRaisesRegex(ValueError, "missing a start"):
            timestamped_asr_spans([{"text": "Một câu không có timestamp"}], 9.0)
        with self.assertRaisesRegex(ValueError, "exceeds audio"):
            timestamped_asr_spans([{"text": " quá giờ", "timestamp": (2, 17)}], 10.0)

    def test_phowhisper_requests_real_word_alignment_from_pipeline(self):
        pipe = FakePipe([
            {"text": " Xin", "timestamp": (0.0, 0.6)},
            {"text": " chào.", "timestamp": (0.6, 1.4)},
            {"text": " Cảm", "timestamp": (2.0, 2.4)},
            {"text": " ơn.", "timestamp": (2.4, 3.0)},
        ])
        asr = PhoWhisperAsr("vinai/PhoWhisper-base")
        asr._pipe = pipe
        output = asr.transcribe(np.zeros(64000, dtype=np.float32), 16000, 4.0)
        self.assertEqual(len(output), 2)
        self.assertEqual(pipe.kwargs["return_timestamps"], "word")
        self.assertEqual(pipe.kwargs["generate_kwargs"]["language"], "vi")
        self.assertIs(pipe.kwargs["generate_kwargs"]["condition_on_prev_tokens"], False)

    def test_adapter_reports_missing_alignment_instead_of_faking_chat(self):
        asr = PhoWhisperAsr("vinai/PhoWhisper-base")
        asr._pipe = FakePipe([{"text": " Lỗi timestamp", "timestamp": None}])
        with self.assertRaisesRegex(ModelNotReady, "word alignment failed"):
            asr.transcribe(np.zeros(32000, dtype=np.float32), 16000, 2.0)


if __name__ == "__main__":
    unittest.main()
