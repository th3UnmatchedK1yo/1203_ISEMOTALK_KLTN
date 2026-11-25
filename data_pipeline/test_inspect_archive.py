import tempfile
import unittest
import zipfile
from pathlib import Path
from data_pipeline.inspect_archive import inspect

class ArchiveTests(unittest.TestCase):
    def test_archive_inventory_without_extraction(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"sample.zip"
            with zipfile.ZipFile(p,"w") as z:
                z.writestr("metadata/manifest.json",'{"labels":["neutral","happy"],"version":1}')
                z.writestr("audio/a.wav",b"not-real-audio")
                z.writestr("labels.csv","id,label\n1,neutral\n")
            r=inspect(p)
            self.assertEqual(r["member_count"],3)
            self.assertEqual(r["extension_counts"][".wav"],1)
            self.assertEqual(r["metadata_previews"][0]["keys"],["labels","version"])
            self.assertFalse(r["extract_performed"])
            self.assertEqual(r["suspicious_member_path_count"],0)

    def test_suspicious_path_detected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"bad.zip"
            with zipfile.ZipFile(p,"w") as z:
                z.writestr("../escape.txt","no extraction")
            self.assertEqual(inspect(p)["suspicious_member_path_count"],1)

if __name__=="__main__":
    unittest.main()
