import csv
import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch
from data_pipeline.audit import (base, components, duplicate_ids, digest, fold_manifest,
                                 run_audit, safe_path, wav_info, lucee, visec, vnemos)

def wav(path, value=1):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path),"wb") as f:
        f.setparams((1,2,16000,0,"NONE","not compressed"))
        f.writeframes(int(value).to_bytes(2,"little",signed=True)*1600)

class AuditTests(unittest.TestCase):
    def test_path_escape_and_truncated_pcm(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            for p in ("../outside.wav","/outside.wav","C:/outside.wav","a/../../outside.wav"):
                with self.assertRaises(ValueError): safe_path(root,p)
            p=root/"test.wav";wav(p)
            self.assertEqual(wav_info(p)["duration_ms"],100)
            p.write_bytes(p.read_bytes()[:-4])
            with self.assertRaises(ValueError): wav_info(p)

    def test_group_transitivity_and_exact_duplicates(self):
        a=base("lucee","a","a.wav","happy","happy","s1",("speaker:s1","conversation:c1"))
        b=base("lucee","b","b.wav","sad","sad","s2",("speaker:s2","conversation:c1"))
        c=base("lucee","c","c.wav","angry","angry","s2",("speaker:s2","conversation:c2"))
        d=base("visec","d","d.wav","angry","angry","s3",("speaker:s3",))
        c["pcm_sha256"]=d["pcm_sha256"]="same"
        self.assertEqual(len(components([a,b,c,d])),1)
        self.assertEqual(duplicate_ids([a,b,c,d]),{"lucee:c","visec:d"})

    def test_visec_actual_schema_and_speaker_zero(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/"data.csv").write_text("index,speaker_id,path,duration,accent,emotion,emotion_id,gender\n0,0,visec/wavs/00000.wav,0.1,south,happy,0,female\n1,1,visec/wavs/00001.wav,0.1,north,angry,3,male\n")
            a,b=list(visec(root))
            self.assertEqual(a["status"],"quarantine")
            self.assertIsNone(a["speaker_id"])
            self.assertEqual(b["emotion"],"angry")
            self.assertIsNone(b["text"])

    def test_lucee_review_and_expected_hash(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); (root/"TEXT").mkdir()
            a={"utterance_id":"u1","audio":{"path":"AUDIO/a.wav","duration_ms":100,"sha256":"a"*64},
               "speaker":{"speaker_id":"s1","pair_id":"p1"},"annotation":{"emotion":"neutral","transcript":"test","label_source":"human_reviewed"},
               "conversation":{"conversation_id":"c1"},"dataset":{"split":"train"},"qc":{"status":"APPROVED"}}
            (root/"TEXT"/"utterances.jsonl").write_text(json.dumps(a)+"\n")
            r=list(lucee(root))[0]
            self.assertEqual(r["source_split"],"train")
            self.assertIn("pair:p1",r["group_keys"])
            self.assertEqual(r["expected_sha256"],"a"*64)
            self.assertEqual(r["text_source"],"human_reviewed")

    def test_vnemos_never_maps_fear_to_angry(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            wav(root/"fear"/"f.wav")
            wav(root/"happiness"/"h.wav")
            rows=list(vnemos(root))
            self.assertEqual(rows[0]["status"],"excluded")
            self.assertIsNone(rows[0]["emotion"])
            self.assertEqual(rows[1]["status"],"historical_eval")

    def test_audit_folds_rights_and_digest(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); raw=root/"raw"; v=raw/"VISEC"; v.mkdir(parents=True)
            with (v/"data.csv").open("w",newline="") as f:
                w=csv.writer(f);w.writerow(["index","speaker_id","path","duration","accent","emotion","emotion_id","gender"])
                for speaker in range(1,6):
                    for i,label in enumerate(("neutral","happy","sad","angry")):
                        uid=speaker*10+i; name=f"{uid}.wav";wav(v/"wavs"/name,uid)
                        w.writerow([uid,speaker,"visec/wavs/"+name,.1,"south",label,i,"unknown"])
            out=root/"audit"
            with patch.dict("data_pipeline.audit.EXPECTED",{"visec":20}):
                report=run_audit(raw,out,["visec"])
            self.assertTrue(report["audit_pass"])
            self.assertEqual(report["sources"]["visec"]["rows"],20)
            rights=root/"rights.json";rights.write_text("{}")
            with self.assertRaises(ValueError): fold_manifest(out,root/"denied",["visec"],rights)
            rights.write_text(json.dumps({"visec":{"allowed":["research_train","research_eval"],"reference":"fixture permission"}}))
            summary=fold_manifest(out,root/"folds",["visec"],rights)
            self.assertEqual(len(summary["visec"]["folds"]),5)
            self.assertTrue(all(f["rows"]==4 for f in summary["visec"]["folds"]))
            manifest=[json.loads(x) for x in (root/"folds"/"development_folds.jsonl").read_text().splitlines()]
            groups={}
            for row in manifest:
                for group in row["group_keys"]: groups.setdefault(group,set()).add(row["fold"])
            self.assertTrue(all(len(v)==1 for v in groups.values()))
            with (out/"inventory.jsonl").open("a") as f:f.write("{}\n")
            with self.assertRaisesRegex(ValueError,"digest"): fold_manifest(out,root/"tampered",["visec"],rights)

    def test_lucee_wrong_hash_blocks_audit(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);raw=root/"raw";v=raw/"VI_FINAL_TRAINING_20260913_144031";(v/"TEXT").mkdir(parents=True)
            wav(v/"AUDIO"/"a.wav")
            row={"utterance_id":"u1","audio":{"path":"AUDIO/a.wav","duration_ms":100,"sha256":"f"*64},
                 "speaker":{"speaker_id":"s1","pair_id":"p1"},"annotation":{"emotion":"sad","transcript":"fixture"},
                 "conversation":{"conversation_id":"c1"},"qc":{"status":"APPROVED"}}
            (v/"TEXT"/"utterances.jsonl").write_text(json.dumps(row)+"\n")
            with patch.dict("data_pipeline.audit.EXPECTED",{"lucee":1}):
                report=run_audit(raw,root/"audit",["lucee"])
            self.assertFalse(report["audit_pass"])
            self.assertEqual(report["sources"]["lucee"]["status_counts"],{"invalid":1})

if __name__=="__main__":
    unittest.main()
