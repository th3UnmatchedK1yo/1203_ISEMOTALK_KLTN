"""Pure tests: anonymous pyannote turns are not agent/customer labels."""
import unittest
from types import SimpleNamespace
from app.adapters.diarization import _segments_from_pyannote

class FakeAnnotation:
    def __init__(self, tracks):
        self.tracks = tracks
    def itertracks(self, yield_label=False):
        for start,end,label in self.tracks:
            yield SimpleNamespace(start=start,end=end),None,label

class TestSpeakerTurns(unittest.TestCase):
    def test_preserves_two_anonymous_voices_in_first_seen_order(self):
        out=SimpleNamespace(exclusive_speaker_diarization=FakeAnnotation([
            (4,8,"speaker_12"),(0,3,"speaker_08"),(9,11,"speaker_08")
        ]))
        self.assertEqual(_segments_from_pyannote(out,10),[
            {"start":0.0,"end":3.0,"speakerId":"A"},
            {"start":4.0,"end":8.0,"speakerId":"B"},
            {"start":9.0,"end":10.0,"speakerId":"A"},
        ])
    def test_one_voice_does_not_invent_second_person(self):
        out=SimpleNamespace(exclusive_speaker_diarization=FakeAnnotation([
            (0,2,"only"),(3,4,"only")
        ]))
        self.assertEqual({x['speakerId'] for x in _segments_from_pyannote(out,6)},{"A"})
    def test_zero_or_tiny_turns_not_emitted(self):
        out=SimpleNamespace(exclusive_speaker_diarization=FakeAnnotation([
            (0,0.03,"one"),(0.1,0.4,"one")
        ]))
        self.assertEqual(len(_segments_from_pyannote(out,2)),1)
    def test_too_many_cluster_ids_requires_review(self):
        from app.adapters.base import ModelNotReady
        out=SimpleNamespace(exclusive_speaker_diarization=FakeAnnotation([
            (0,1,"a"),(2,3,"b"),(4,5,"c")
        ]))
        with self.assertRaises(ModelNotReady):
            _segments_from_pyannote(out,7)
if __name__=="__main__":unittest.main()
