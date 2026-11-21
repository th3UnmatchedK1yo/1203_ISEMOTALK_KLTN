"""Artifact and evaluation regressions. Fixtures are synthetic, not trained weights."""
from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
import uuid
import wave
from pathlib import Path
from unittest.mock import patch

from app.adapters.base import EMOTIONS, ModelNotReady, SerItem
from app.adapters.ser_checkpoint import CheckpointSer, read_verification, sha256_file, verification_path
from app.verify import main, macro_f1


class VerificationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        module = "verification_fixture_" + uuid.uuid4().hex
        source = self.root / (module + ".py")
        source.write_text(
            "class Model:\n"
            "    def predict(self, waveform, text, speaker):\n"
            "        labels = ['neutral', 'happy', 'sad', 'angry']\n"
            "        return {'fused': [float(text == label) for label in labels]}\n"
            "def build(config):\n"
            "    return Model()\n", encoding="utf-8")
        self.factory = module + ":build"
        self.weights = self.root / "model.bin"
        self.weights.write_bytes(b"synthetic fixture; not model weights")
        self.config = self.root / "ser.json"
        self.config.write_text(json.dumps({
            "labels": list(EMOTIONS), "factorySource": source.name,
            "artifacts": [
                {"path": self.weights.name, "sha256": sha256_file(self.weights), "role": "weights"},
                {"path": source.name, "sha256": sha256_file(source), "role": "code"},
            ],
        }), encoding="utf-8")
        self.manifest = self.root / "eval.jsonl"
        self.rows = []
        for label in EMOTIONS:
            path = self.root / (label + ".wav")
            with wave.open(str(path), "wb") as f:
                f.setnchannels(1); f.setsampwidth(2); f.setframerate(16000)
                f.writeframes(b"\x00\x00" * 1600)
            self.rows.append({"audio": str(path), "text": label, "label": label})
        self.write_rows(self.rows)
        env = patch.dict("os.environ", {"ISEMO_SER_FACTORY": self.factory, "ISEMO_SER_CONFIG": str(self.config)})
        env.start(); self.addCleanup(env.stop)

    def write_rows(self, rows):
        self.manifest.write_text("\n".join(json.dumps(x) for x in rows), encoding="utf-8")

    def verify(self, *extra):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return main(["--manifest", str(self.manifest), "--min-macro-f1", "0.5", *extra])

    def test_modified_weights_invalidate_verification(self):
        self.assertEqual(self.verify(), 0)
        self.assertTrue(read_verification(self.config)[0])
        self.weights.write_bytes(b"changed bytes")
        self.assertFalse(read_verification(self.config)[0])

    def test_modified_evaluation_manifest_invalidates_verification(self):
        self.assertEqual(self.verify(), 0)
        self.manifest.write_text(self.manifest.read_text() + "\n", encoding="utf-8")
        self.assertFalse(read_verification(self.config)[0])

    def test_changed_factory_cannot_reuse_verified_record(self):
        self.assertEqual(self.verify(), 0)
        adapter = CheckpointSer("different.module:build", str(self.config))
        self.assertFalse(adapter.status().ready)

    def test_loaded_model_is_not_reused_after_artifact_change(self):
        self.assertEqual(self.verify(), 0)
        adapter = CheckpointSer(self.factory, str(self.config))
        import numpy as np
        item = SerItem("one", 0, 0.1, "happy", "unknown")
        adapter.predict([item], lambda *_: np.zeros(1600, dtype=np.float32))
        self.weights.write_bytes(b"changed bytes")
        with self.assertRaises(ModelNotReady):
            adapter.predict([item], lambda *_: np.zeros(1600, dtype=np.float32))

    def test_legacy_and_malformed_records_fail_closed(self):
        for record in ({"verified": True, "configSha256": sha256_file(self.config)}, [], "garbage"):
            with self.subTest(record=record):
                verification_path(self.config).write_text(json.dumps(record), encoding="utf-8")
                self.assertFalse(read_verification(self.config)[0])

    def test_manifest_requires_nonempty_four_class_coverage(self):
        for rows in ([], self.rows[:1]):
            with self.subTest(count=len(rows)):
                self.write_rows(rows)
                self.assertNotEqual(self.verify(), 0)
                self.assertFalse(verification_path(self.config).exists())

    def test_manifest_rejects_invalid_labels_and_intervals_before_inference(self):
        for change in ({"label": "unknown"}, {"start": float("nan")}, {"start": 1, "end": 0.5}):
            with self.subTest(change=change):
                rows = [dict(x) for x in self.rows]; rows[0].update(change)
                self.write_rows(rows)
                self.assertNotEqual(self.verify(), 0)
                self.assertFalse(verification_path(self.config).exists())

    def test_invalid_thresholds_never_write_a_pass(self):
        for threshold in ("0", "-1", "nan", "inf", "1.01"):
            with self.subTest(threshold=threshold):
                self.assertNotEqual(self.verify("--min-macro-f1", threshold), 0)
                self.assertFalse(verification_path(self.config).exists())

    def test_check_only_does_not_import_factory_or_write_verification(self):
        with patch("app.adapters.ser_checkpoint.importlib.import_module", side_effect=AssertionError("must not load")):
            self.assertEqual(self.verify("--check-only"), 0)
        self.assertFalse(verification_path(self.config).exists())

    def test_macro_f1_uses_all_four_classes(self):
        score, _ = macro_f1(["happy"], ["happy"])
        self.assertEqual(score, 0.25)

    def test_new_evaluation_can_replace_corrupted_old_record(self):
        verification_path(self.config).write_text("[]", encoding="utf-8")
        self.assertEqual(self.verify(), 0)
        self.assertTrue(read_verification(self.config)[0])

    def test_weight_replacement_after_hash_validation_cannot_become_load_baseline(self):
        self.assertEqual(self.verify(), 0)
        adapter = CheckpointSer(self.factory, str(self.config))

        def replace_after_validation(*args, **kwargs):
            result = read_verification(*args, **kwargs)
            self.assertTrue(result[0])
            # Deterministic interleaving: real hashes pass, then bytes change
            # before the loader is allowed to establish a trusted identity.
            self.weights.write_bytes(b"replacement after successful hash validation")
            return result

        with patch("app.adapters.ser_checkpoint.read_verification", side_effect=replace_after_validation):
            with self.assertRaisesRegex(ModelNotReady, "trong lúc xác minh"):
                adapter._load()
        self.assertFalse(adapter.verified)
        self.assertFalse(adapter.status().verified)
        self.assertFalse(adapter.status().loaded)
        self.assertFalse(read_verification(self.config)[0])


if __name__ == "__main__":
    unittest.main()
