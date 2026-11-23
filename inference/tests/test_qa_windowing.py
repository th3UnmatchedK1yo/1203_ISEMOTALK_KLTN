"""Window coverage tests for real QA inference: no downloads or GPU needed."""
import unittest
from app.qa_triage import window_starts, xlmr_window_ids
from app.adapters.base import ModelNotReady

class MinimalTransformers5XLMR:
    """Reproduces the current server tokenizer's missing legacy API."""
    cls_token_id = 0
    sep_token_id = 2

    def num_special_tokens_to_add(self, pair=False):
        assert pair is False
        return 2


class UnsupportedTokenTemplate(MinimalTransformers5XLMR):
    def num_special_tokens_to_add(self, pair=False):
        return 3




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

    def test_xlmr_windows_without_removed_prepare_for_model(self):
        tokenizer = MinimalTransformers5XLMR()
        self.assertFalse(hasattr(tokenizer, "prepare_for_model"))
        tokens = [10, 11, 12, 13, 14, 15]
        self.assertEqual(xlmr_window_ids(tokenizer, tokens, 0, 4), [0, 10, 11, 12, 13, 2])
        self.assertEqual(xlmr_window_ids(tokenizer, tokens, 3, 4), [0, 13, 14, 15, 2])

    def test_rejects_unverified_or_invalid_window_template(self):
        with self.assertRaises(ModelNotReady):
            xlmr_window_ids(UnsupportedTokenTemplate(), [10, 11], 0, 2)
        with self.assertRaises(ValueError):
            xlmr_window_ids(MinimalTransformers5XLMR(), [10, 11], 2, 2)

    def test_very_long_transcript_bounds_gpu_cost_and_flags_incomplete(self):
        starts, incomplete = window_starts(50000, 254, 48)
        self.assertTrue(incomplete)
        self.assertLessEqual(len(starts), 48)
        self.assertEqual(starts[0], 0)
        self.assertEqual(starts[-1] + 254, 50000)


if __name__ == "__main__":
    unittest.main()
