"""Read-only corpus audit. No training, downloads, ASR or executable pickle loads."""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import wave
from collections import Counter, defaultdict
from pathlib import Path

LABELS = ("neutral", "happy", "sad", "angry")
SOURCES = {
    "visec": "VISEC",
    "lucee": "VI_FINAL_TRAINING_20260913_144031",
    "vnemos": "VNEMOS",
    "iemocap": "IEMOCAP",
    "onevoice": "OneVoice",
}
EXPECTED = {"visec": 5280, "lucee": 701, "vnemos": 250, "onevoice": 1200}
VNEMOS = {"angry": "angry", "happiness": "happy", "neutral": "neutral", "sadness": "sad", "fear": None}
IEMOCAP = {"neu": "neutral", "hap": "happy", "sad": "sad", "ang": "angry"}
# exc is NOT silently merged into happy; a separate protocol may opt into that.
EVAL_LINE = re.compile(r"^\[\s*([\d.]+)\s*-\s*([\d.]+)\s*\]\s+(\S+)\s+(\S+)")
TEXT_LINE = re.compile(r"^(\S+)\s+\[[^\]]+\]:\s*(.*)$")
REPO = Path(__file__).resolve().parents[1]

def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()

def jsonl(path: Path):
    with path.open(encoding="utf-8-sig") as f:
        for n, line in enumerate(f, 1):
            if line.strip():
                obj = json.loads(line)
                if not isinstance(obj, dict):
                    raise ValueError(f"Expected object at line {n}")
                yield obj

def safe_path(root: Path, relative: str) -> Path:
    p = Path(relative.replace("\\", "/"))
    if not relative or p.is_absolute() or ".." in p.parts or ":" in str(p):
        raise ValueError("Unsafe or absolute relative path")
    resolved = (root / p).resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError("Path escapes corpus root")
    return resolved

def new_private_dir(out: Path, raw: Path | None = None):
    out = out.resolve()
    if out.is_relative_to(REPO) or (raw and out.is_relative_to(raw.resolve())):
        raise ValueError("Outputs must be outside the Git checkout and raw data")
    out.mkdir(parents=True, mode=0o700, exist_ok=False)

def wav_info(path: Path) -> dict:
    """Read all PCM frames, not just the WAV header. Non-PCM requires manual conversion."""
    raw_hash = digest(path)
    with wave.open(str(path), "rb") as w:
        rate, channels, width, frames = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        if min(rate, channels, width, frames) <= 0 or w.getcomptype() != "NONE":
            raise ValueError("Unsupported or empty PCM WAV")
        h = hashlib.sha256(f"{rate}:{channels}:{width}:".encode())
        read_bytes = 0
        while True:
            block = w.readframes(65536)
            if not block:
                break
            h.update(block)
            read_bytes += len(block)
        if read_bytes != frames * channels * width:
            raise ValueError("Truncated WAV frames")
    return {"sha256": raw_hash, "pcm_sha256": h.hexdigest(), "duration_ms": round(1000 * frames / rate),
            "sample_rate_hz": rate, "channels": channels, "sample_width_bytes": width}

def base(source, uid, rel, label_raw, label, speaker=None, groups=(), text=None, text_source="missing", **extra):
    return {"source": source, "sample_id": f"{source}:{uid}", "audio_relpath": rel, "label_raw": label_raw,
            "emotion": label, "speaker_id": speaker, "group_keys": sorted(set(g for g in groups if g)),
            "text": text or None, "text_source": text_source if text else "missing",
            "task": "ser", "issues": [], "status": "candidate", **extra}

def visec(root):
    meta = root / "data.csv"
    with meta.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not {"path","speaker_id","emotion","duration","accent"}.issubset(reader.fieldnames or []):
            raise ValueError("Unexpected ViSEC CSV schema")
        for a in reader:
            source_path = a["path"].replace("\\", "/")
            parts = Path(source_path).parts
            if len(parts) != 3 or parts[0].lower() != "visec" or parts[1] != "wavs" or ".." in parts:
                raise ValueError("Unexpected ViSEC audio path")
            sid = str(a["speaker_id"]).strip()
            raw = a["emotion"].strip().lower()
            row = base("visec", parts[-1], "wavs/" + parts[-1], raw, raw if raw in LABELS else None,
                       sid if sid and sid != "0" else None,
                       (f"speaker:{sid}",) if sid and sid != "0" else (),
                       expected_duration_ms=round(float(a["duration"])*1000), accent=a["accent"],
                       source_split=None, recording_type="source_corpus")
            if not row["speaker_id"]:
                row["issues"].append("unknown_speaker")
                row["status"] = "quarantine"
            if row["emotion"] is None:
                row["issues"].append("unsupported_label")
                row["status"] = "excluded"
            yield row

def lucee(root):
    for a in jsonl(root / "TEXT" / "utterances.jsonl"):
        au, sp, ann, conv = a["audio"], a["speaker"], a["annotation"], a["conversation"]
        sid, cid, pair = sp.get("speaker_id"), conv.get("conversation_id"), sp.get("pair_id")
        raw = str(ann.get("emotion", "")).strip().lower()
        row = base("lucee", a["utterance_id"], au["path"], raw, raw if raw in LABELS else None, sid,
                   (f"speaker:{sid}" if sid else None, f"conversation:{cid}" if cid else None, f"pair:{pair}" if pair else None),
                   ann.get("transcript"), "human_reviewed" if ann.get("label_source") == "human_reviewed" else "source_annotation",
                   expected_duration_ms=au.get("duration_ms"), expected_sha256=au.get("sha256"),
                   conversation_id=cid, pair_id=pair, source_split=a.get("dataset",{}).get("split"),
                   recording_type="human_scripted")
        if not sid or not cid or not pair or not row["text"] or a.get("qc",{}).get("status") != "APPROVED":
            row["issues"].append("missing_group_text_or_qc")
            row["status"] = "quarantine"
        if not row["expected_sha256"] or not re.fullmatch(r"[0-9a-fA-F]{64}", row["expected_sha256"]):
            row["issues"].append("missing_expected_audio_hash")
            row["status"] = "quarantine"
        if row["emotion"] is None:
            row["issues"].append("unsupported_label")
            row["status"] = "excluded"
        yield row

def vnemos(root):
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        raw = folder.name.lower()
        for path in sorted(p for p in folder.rglob("*") if p.is_file() and p.suffix.lower()==".wav"):
            rel = path.relative_to(root).as_posix()
            row = base("vnemos", rel, rel, raw, VNEMOS.get(raw), recording_type="media",
                       benchmark="historical_external_only")
            row["status"] = "historical_eval" if row["emotion"] else "excluded"
            if row["emotion"] is None:
                row["issues"].append("unsupported_label")
            row["issues"].append("speaker_unverified")
            yield row

def iemocap(root):
    sessions = sorted(p for p in root.glob("Session[1-5]") if p.is_dir())
    if {p.name for p in sessions} != {f"Session{i}" for i in range(1,6)}:
        raise ValueError("Expected all five IEMOCAP sessions")
    for session in sessions:
        if not list((session / "dialog" / "EmoEvaluation").glob("*.txt")):
            raise ValueError("Missing session emotion annotations")
        for ann in sorted((session / "dialog" / "EmoEvaluation").glob("*.txt")):
            transcript = session / "dialog" / "transcriptions" / (ann.stem + ".txt")
            texts = {}
            if transcript.is_file():
                for line in transcript.read_text(encoding="utf-8", errors="replace").splitlines():
                    m = TEXT_LINE.match(line)
                    if m:
                        texts[m[1]] = m[2].strip()
            for line in ann.read_text(encoding="utf-8", errors="replace").splitlines():
                m = EVAL_LINE.match(line)
                if not m:
                    if line.lstrip().startswith("["):
                        raise ValueError("Malformed IEMOCAP evaluation row")
                    continue
                start, end, uid, raw = m.groups()
                if not re.fullmatch(r"Ses\d\d[FM]_.+_[FM]\d+", uid):
                    raise ValueError("Unexpected IEMOCAP utterance ID")
                sid = uid[:5] + uid.rsplit("_", 1)[-1][0]
                rel = f"{session.name}/sentences/wav/{uid.rsplit('_',1)[0]}/{uid}.wav"
                row = base("iemocap", uid, rel, raw, IEMOCAP.get(raw), sid,
                           (f"session:{session.name}", f"speaker:{sid}"), texts.get(uid), "source_transcript",
                           language="en", session=session.name, recording_type="elicited_english",
                           source_start=float(start), source_end=float(end))
                if row["emotion"] is None:
                    row["issues"].append("unsupported_label")
                    row["status"] = "excluded"
                else:
                    row["status"] = "auxiliary"
                yield row

def onevoice(root):
    # Metadata prepared by the existing pinned downloader. Missing WAVs are
    # explicit, never fabricated. This is call-level BUSINESS classification.
    src = root / "records.jsonl"
    manifest = json.loads((root / "source_manifest.json").read_text(encoding="utf-8"))
    if manifest.get("records_sha256") != digest(src):
        raise ValueError("OneVoice metadata does not match source manifest")
    for a in jsonl(src):
        customer, agent = a.get("customer_voice_id"), a.get("employee_id")
        label = a.get("label")
        row = base("onevoice", a["id"], a["audio_relpath"], label, None, None,
                   (f"customer_voice:{customer}" if customer else None, f"agent_voice:{agent}" if agent else None),
                   a.get("text"), "synthetic_script", task="business_attention", recording_type="synthetic",
                   business_label=label, source_revision=manifest.get("commit"), customer_voice_id=customer,
                   employee_id=agent)
        row["status"] = "synthetic_only"
        if type(label) is not int or label not in (0,1) or not customer or not agent or not row["text"]:
            row["status"] = "quarantine"
            row["issues"].append("missing_or_invalid_business_metadata")
        yield row

ADAPTERS = {"visec":visec, "lucee":lucee, "vnemos":vnemos, "iemocap":iemocap, "onevoice":onevoice}
METADATA = {"visec":["data.csv"],"lucee":["TEXT/utterances.jsonl","MANIFEST/export_manifest.json"],
            "vnemos":[],"iemocap":[],"onevoice":["records.jsonl","source_manifest.json"]}

def audit_audio(row, corpus):
    try:
        p = safe_path(corpus, row["audio_relpath"])
        if row["source"] == "onevoice" and not p.exists():
            row["issues"].append("audio_not_downloaded")
            row["status"] = "metadata_only" if row["status"] == "synthetic_only" else row["status"]
            return
        info = wav_info(p)
        row.update(info)
        expected = row.get("expected_sha256")
        if expected and info["sha256"].lower() != expected.lower():
            raise ValueError("audio_sha256_mismatch")
        dur = row.get("expected_duration_ms")
        if dur is not None and abs(info["duration_ms"] - dur) > max(50, dur * .02):
            raise ValueError("audio_duration_mismatch")
    except (OSError, EOFError, wave.Error, ValueError) as e:
        row["issues"].append("audio_invalid:" + type(e).__name__ + (":" + str(e) if isinstance(e, ValueError) else ""))
        row["status"] = "invalid"

class Groups:
    def __init__(self):
        self.parents = {}
    def find(self, x):
        self.parents.setdefault(x, x)
        if self.parents[x] != x:
            self.parents[x] = self.find(self.parents[x])
        return self.parents[x]
    def union(self, a, b):
        a,b = self.find(a),self.find(b)
        if a != b:
            lo,hi = sorted((a,b))
            self.parents[hi] = lo

def components(rows):
    groups = Groups()
    for r in rows:
        uid = "sample:" + r["sample_id"]
        groups.find(uid)
        for key in r["group_keys"]:
            groups.union(uid, f'{r["source"]}:{key}')
        # Exact-file and raw PCM equality are independent of file header metadata.
        for field in ("sha256","pcm_sha256"):
            if r.get(field):
                groups.union(uid, field + ":" + r[field])
    out = defaultdict(list)
    for r in rows:
        out[groups.find("sample:" + r["sample_id"])].append(r)
    return list(out.values())

def duplicate_ids(rows):
    dup = set()
    for field in ("sha256","pcm_sha256"):
        buckets = defaultdict(list)
        for r in rows:
            if r.get(field):
                buckets[r[field]].append(r["sample_id"])
        for ids in buckets.values():
            if len(ids) > 1:
                dup.update(ids)
    return dup

def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")

def write_jsonl(path, rows):
    with path.open("x", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")

def run_audit(raw, out, sources):
    raw, out = raw.resolve(), out.resolve()
    if not raw.is_dir():
        raise ValueError("Raw root does not exist")
    new_private_dir(out, raw)
    rows, failures, source_hashes = [], {}, {}
    for source in sources:
        corpus = raw / SOURCES[source]
        try:
            if not corpus.is_dir():
                raise ValueError("Corpus folder missing")
            source_hashes[source] = {}
            for rel in METADATA[source]:
                path = safe_path(corpus, rel)
                if path.is_file():
                    source_hashes[source][rel] = digest(path)
            if source == "iemocap":
                for pattern in ("Session*/dialog/EmoEvaluation/*.txt","Session*/dialog/transcriptions/*.txt"):
                    for path in sorted(corpus.glob(pattern)):
                        rel = path.relative_to(corpus).as_posix()
                        source_hashes[source][rel] = digest(safe_path(corpus,rel))
            for row in ADAPTERS[source](corpus):
                row["audio_relpath"] = SOURCES[source] + "/" + row["audio_relpath"]
                # Audit uses raw root after prefixing canonical corpus folder.
                audit_audio(row, raw)
                rows.append(row)
        except (OSError, KeyError, TypeError, ValueError, UnicodeError) as e:
            failures[source] = type(e).__name__  # no transcript/private path in summary
    dup_ids = duplicate_ids(rows)
    counts = Counter(r["sample_id"] for r in rows)
    if any(n > 1 for n in counts.values()):
        failures["duplicate_sample_id"] = "Duplicate primary IDs"
    for r in rows:
        if r["sample_id"] in dup_ids:
            r["issues"].append("exact_duplicate_audio")
    report = {"schema_version":1,"requested_sources":sources,"source_metadata_sha256":source_hashes,
              "failures":failures,"sources":{},"scope":"raw PCM and metadata audit; not near-duplicate or consent verification"}
    for s in sources:
        rr = [r for r in rows if r["source"] == s]
        stat = {"rows":len(rr), "expected_rows":EXPECTED.get(s),
                "status_counts":dict(Counter(r["status"] for r in rr)),
                "label_counts":dict(Counter(str(r["label_raw"]) for r in rr)),
                "speaker_count":len({r["speaker_id"] for r in rr if r["speaker_id"]}),
                "hours_valid_audio":round(sum(r.get("duration_ms",0) for r in rr if r["status"]!="invalid")/3600000,6),
                "text_source_counts":dict(Counter(r["text_source"] for r in rr)),
                "issue_counts":dict(Counter(issue.split(":")[0] for r in rr for issue in r["issues"])),
                "audio_verified_rows":sum(bool(r.get("sha256")) and r["status"]!="invalid" for r in rr),
                "duplicate_rows":sum(r["sample_id"] in dup_ids for r in rr)}
        # Only rows eligible for that source's strict group analysis.
        grouped = [r for r in rr if r["status"] in ("candidate","synthetic_only","metadata_only","auxiliary")]
        stat["component_sizes"] = sorted((len(c) for c in components(grouped)),reverse=True)
        report["sources"][s] = stat
        if s == "vnemos" and Counter(r["label_raw"] for r in rr) != Counter({label:50 for label in VNEMOS}):
            failures[s] = "Unexpected VNEMOS class counts or folder names"
        if not rr or (s in EXPECTED and len(rr) != EXPECTED[s]):
            failures[s] = "Missing or unexpected row count; confirm exact source version"
        if any(r["status"] == "invalid" for r in rr):
            failures[s] = "Invalid audio present"
    write_jsonl(out / "inventory.jsonl", rows)
    report["inventory_sha256"] = digest(out / "inventory.jsonl")
    report["audit_pass"] = not failures
    write_json(out / "report.json", report)
    return report

def fold_manifest(inventory_dir, out, sources, rights_path, seed=20261125):
    report = json.loads((inventory_dir/"report.json").read_text(encoding="utf-8"))
    p = inventory_dir/"inventory.jsonl"
    if report["inventory_sha256"] != digest(p):
        raise ValueError("Inventory digest mismatch")
    rights = json.loads(rights_path.read_text(encoding="utf-8"))
    rows = list(jsonl(p))
    # Any repeated audio across the audited pool is excluded from strict folds,
    # not just duplicates within the chosen training source.
    dups = duplicate_ids(rows)
    result, summary = [], {}
    for s in sources:
        if s not in ("visec","lucee"):
            raise ValueError("Only strict ViSEC/LUCEE development folds are supported here")
        if not report.get("audit_pass") or s not in report["sources"]:
            raise ValueError("Successful audit of selected sources required")
        grant = rights.get(s,{})
        if not {"research_train","research_eval"}.issubset(set(grant.get("allowed",[]))) or not str(grant.get("reference","")).strip():
            raise ValueError(f"Research permission evidence missing for {s}")
        eligible = [r for r in rows if r["source"] == s and r["status"]=="candidate" and
                    r["emotion"] in LABELS and r.get("speaker_id") and r.get("sha256") and r["sample_id"] not in dups]
        cc = components(eligible)
        k = 5 if s=="visec" else len(cc)
        if k < 3 or len(cc) < k:
            raise ValueError(f"Not enough independent groups for {s}")
        # Deterministic, group-preserving development folds. Greedy class-aware
        # allocation is a design choice, not the historical paper split.
        def key(group):
            ids = "|".join(sorted(r["sample_id"] for r in group))
            return hashlib.sha256(f"{seed}:{ids}".encode()).hexdigest()
        cc.sort(key=lambda g:(-len(g),key(g)))
        bins = [[] for _ in range(k)]
        targets = Counter(r["emotion"] for r in eligible)
        for group in cc:
            gc = Counter(r["emotion"] for r in group)
            empty = [i for i,b in enumerate(bins) if not b]
            pool = empty or list(range(k))
            def score(i):
                before = Counter(r["emotion"] for r in bins[i])
                return sum(((before[l]+gc[l])**2-before[l]**2)/max(targets[l],1) for l in LABELS)
            i = min(pool,key=lambda i:(score(i),len(bins[i]),i))
            bins[i].extend(group)
        fold_stats = []
        for i, b in enumerate(bins):
            labels = Counter(r["emotion"] for r in b)
            if set(labels)!=set(LABELS):
                raise ValueError(f"{s} fold {i} missing a class: {dict(labels)}; revise protocol before training")
            fold_stats.append({"fold":i,"rows":len(b),"labels":dict(labels)})
            for r in b:
                result.append({"sample_id":r["sample_id"],"source":s,"fold":i,"sha256":r["sha256"],
                               "emotion":r["emotion"],"group_keys":r["group_keys"]})
        summary[s] = {"groups":len(cc),"eligible":len(eligible),"folds":fold_stats}
    new_private_dir(out, inventory_dir)
    write_jsonl(out/"development_folds.jsonl",sorted(result,key=lambda r:r["sample_id"]))
    write_json(out/"split_report.json",{"source_inventory_sha256":digest(p),"rights_snapshot_sha256":digest(rights_path),
              "seed":seed,"protocol":"development only; not novel independent test; near-duplicate and cross-source speaker audit still required",
              "sources":summary,"folds_sha256":digest(out/"development_folds.jsonl")})
    return summary

def main(argv=None):
    os.umask(0o077)
    ap=argparse.ArgumentParser(description=__doc__)
    sub=ap.add_subparsers(dest="command",required=True)
    a=sub.add_parser("audit")
    a.add_argument("--root",type=Path,required=True)
    a.add_argument("--out",type=Path,required=True)
    a.add_argument("--sources",nargs="+",choices=SOURCES,default=["visec","lucee","vnemos","iemocap"])
    f=sub.add_parser("folds")
    f.add_argument("--inventory",type=Path,required=True)
    f.add_argument("--out",type=Path,required=True)
    f.add_argument("--rights",type=Path,required=True)
    f.add_argument("--sources",nargs="+",choices=("visec","lucee"),required=True)
    f.add_argument("--seed",type=int,default=20261125)
    args=ap.parse_args(argv)
    try:
        if len(args.sources)!=len(set(args.sources)):
            raise ValueError("Duplicate source selection")
        if args.command=="audit":
            r=run_audit(args.root,args.out,args.sources)
            print(json.dumps(r,ensure_ascii=False,indent=2))
            return 0 if r["audit_pass"] else 2
        print(json.dumps(fold_manifest(args.inventory,args.out,args.sources,args.rights,args.seed),indent=2))
        return 0
    except (OSError,KeyError,TypeError,ValueError) as e:
        print("BLOCKED:",str(e),file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
