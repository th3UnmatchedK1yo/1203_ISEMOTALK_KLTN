"""Pure offline checks for human phone-call sample selection/provenance."""
from __future__ import annotations

import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "download_real_phone_demo.py"
spec = importlib.util.spec_from_file_location("real_phone_demo", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RealPhoneDemoTests(unittest.TestCase):
    def test_vi_only_pinned_selection(self):
        files = ["preview/en_000001.mp3", "preview/vi_000002.mp3",
                 "preview/vi_000001.mp3", "preview/vi_00000a.mp3", "README.md"]
        self.assertEqual(
            module.select_vietnamese(files, 2),
            ["preview/vi_000001.mp3", "preview/vi_000002.mp3"],
        )

    def test_rejects_missing_vietnamese(self):
        with self.assertRaisesRegex(RuntimeError, "No pinned Vietnamese"):
            module.select_vietnamese(["preview/en_000001.mp3"], 1)

    def test_pinned_hash_format_and_file_hash(self):
        self.assertTrue(module.valid_revision("a" * 40))
        self.assertFalse(module.valid_revision("NOT_A_REVISION"))
        with tempfile.TemporaryDirectory() as root:
            p = Path(root) / "audio"
            p.write_bytes(b"real source files are never synthesized by this helper")
            self.assertEqual(module.sha256(p), hashlib.sha256(p.read_bytes()).hexdigest())


if __name__ == "__main__":
    unittest.main()
