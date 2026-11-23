"""Offline tests for public ASR audio extraction and identity pinning."""
import tempfile
import unittest
import wave
from pathlib import Path

from scripts.download_asr_benchmarks import SOURCES, select_filename, wav_from_bytes


class AsrBenchmarkContractTests(unittest.TestCase):
    def test_fleurs_uses_vietnamese_test_not_training(self):
        names = [
            "parquet-data/vi_vn/train-00000-of-00001.parquet",
            "parquet-data/en_us/test-00000-of-00001.parquet",
            "parquet-data/vi_vn/test-00000-of-00001.parquet",
        ]
        self.assertEqual(
            select_filename(names, SOURCES["fleurs-vi-test"]),
            "parquet-data/vi_vn/test-00000-of-00001.parquet",
        )

    def test_fosd_is_explicitly_diagnostic_not_test(self):
        names = ["data/train-00000-of-00002.parquet", "data/train-00001-of-00002.parquet"]
        self.assertEqual(select_filename(names, SOURCES["fpt-fosd-sample"]), names[0])
        self.assertEqual(SOURCES["fpt-fosd-sample"]["split"], "train")

    def test_ambiguous_and_missing_files_fail_closed(self):
        match = SOURCES["fleurs-vi-test"]
        with self.assertRaises(RuntimeError):
            select_filename([], match)
        with self.assertRaises(RuntimeError):
            select_filename(["parquet-data/vi_vn/test-00000-of-00001.parquet"] * 2, match)

    def test_invalid_audio_bytes_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "audio" / "00001.wav"
            with self.assertRaises(ValueError):
                wav_from_bytes(b"", path)
            self.assertFalse(path.exists())


if __name__ == "__main__":
    unittest.main()
