"""Window coverage tests for real QA inference: no downloads or GPU needed."""
import unittest
from app.qa_triage import window_starts


class QaWindowingTests(unittest.TestCase):
    def test_short_transcript_one_window(self):
        self.assertEqual(window_starts(100, 254), ([0], False))

    def test_tail_is_always_covered(self):
        for total in (255, 500, 600, 700, 1000):
            starts, incomplete = window_starts(total, 254)
            self.assertFalse(incomplete)
            self.assertEqual(starts[0], 0)
            self.assertEqual(starts[-1] + 254, total)
            covered = set()
            for p in starts:
                covered.update(range(p, p + 254))
            self.assertEqual(len(covered), total)

    def test_very_long_transcript_bounds_gpu_cost_and_flags_incomplete(self):
        starts, incomplete = window_starts(50000, 254, 48)
        self.assertTrue(incomplete)
        self.assertLessEqual(len(starts), 48)
        self.assertEqual(starts[0], 0)
        self.assertEqual(starts[-1] + 254, 50000)


if __name__ == "__main__":
    unittest.main()
