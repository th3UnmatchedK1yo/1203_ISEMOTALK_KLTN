"""Fast offline safety tests. Do not download any model/dataset in CI."""
import csv
import tempfile
import unittest
from pathlib import Path

from scripts.download_onevoice import parse_binary, prepare_rows
from scripts.train_onevoice_qa import split_records, metrics


class OneVoiceQaContractTests(unittest.TestCase):
    def test_needs_attention_is_binary_not_emotion(self):
        for value in (1, "True", "yes", "có"):
            self.assertEqual(parse_binary(value), 1)
        for value in (0, "False", "no", "không"):
            self.assertEqual(parse_binary(value), 0)
        for value in ("angry", "negative", "", "needs_review"):
            with self.assertRaises(ValueError):
                parse_binary(value)

    def test_metadata_rejects_path_traversal_and_preserves_source_label(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "metadata.csv"
            def write(audio):
                with p.open("w", encoding="utf-8", newline="") as f:
                    w = csv.DictWriter(f, fieldnames=[
                        "file_name", "transcript", "needs_attention", "customer_voice_id"
                    ])
                    w.writeheader()
                    w.writerow({"file_name": audio, "transcript": "Tôi chưa nhận được tiền",
                                "needs_attention": "True", "customer_voice_id": "speaker-A"})
            write("audio/agent_1/test.wav")
            r = prepare_rows(p)
            self.assertEqual(r[0]["label"], 1)
            self.assertEqual(r[0]["text"], "Tôi chưa nhận được tiền")
            write("../customer.wav")
            with self.assertRaises(ValueError):
                prepare_rows(p)

    def test_group_split_has_no_customer_voice_overlap(self):
        rows = [{"id": f"{voice}-{i}", "text": f"Xin chào {voice} {i}", "label": i % 2,
                 "customer_voice_id": voice}
                for voice in ["v1", "v2", "v3", "v4", "v5"] for i in range(12)]
        groups = split_records(rows, 2026)
        self.assertEqual(sum(len(v) for v in groups.values()), len(rows))
        voices = {part: {r["customer_voice_id"] for r in values} for part, values in groups.items()}
        self.assertFalse(voices["train"] & voices["val"])
        self.assertFalse(voices["train"] & voices["test"])
        self.assertFalse(voices["val"] & voices["test"])

    def test_metrics_are_computed_from_truth_not_predictions(self):
        report = metrics([1, 0, 1, 0], [0.9, 0.8, 0.3, 0.1], top_k=2)
        self.assertEqual(report["confusion_rows_truth_cols_prediction"], [[1, 1], [1, 1]])
        self.assertEqual(report["precision_at_k"], 0.5)
        self.assertEqual(report["recall_at_k"], 0.5)


if __name__ == "__main__":
    unittest.main()
