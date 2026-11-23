"""Offline test: preferred ASR selection cannot silently load an unknown model."""
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "stage_phowhisper_upgrade.py"
spec = importlib.util.spec_from_file_location("stage_asr_upgrade", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TestPhoWhisperUpgradeManifest(unittest.TestCase):
    def test_approved_pinned_models_only(self):
        rev = "a" * 40
        self.assertEqual(
            module.validate_selection({"model_id": "vinai/PhoWhisper-medium", "revision": rev}),
            ("vinai/PhoWhisper-medium", rev),
        )
        self.assertEqual(
            module.validate_selection({"model_id": "vinai/PhoWhisper-large", "revision": rev}),
            ("vinai/PhoWhisper-large", rev),
        )
        with self.assertRaisesRegex(ValueError, "approved"):
            module.validate_selection({"model_id": "untrusted/llm", "revision": rev})
        with self.assertRaisesRegex(ValueError, "immutable"):
            module.validate_selection({"model_id": "vinai/PhoWhisper-medium", "revision": "main"})


if __name__ == "__main__":
    unittest.main()
