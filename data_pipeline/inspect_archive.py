"""Safe, non-extracting inventory of a ZIP dataset archive."""
from __future__ import annotations
import argparse
import collections
import hashlib
import json
import re
import zipfile
from pathlib import Path

MAX_METADATA = 1_000_000
MANIFEST_HINTS = ("readme", "manifest", "metadata", "label", "annotation", "transcript", "split", "dataset_info", "config")

def sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(1<<20),b""):
            h.update(block)
    return h.hexdigest()

def inspect(archive: Path) -> dict:
    archive=archive.resolve()
    ext=collections.Counter()
    top=collections.Counter()
    files=0
    uncompressed=0
    compressed=0
    suspicious=0
    metadata=[]
    previews=[]
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            name=info.filename.replace(chr(92), "/")
            parts=Path(name).parts
            if name.startswith("/") or ".." in parts or re.match(r"^[A-Za-z]:",name):
                suspicious+=1
            if info.is_dir():
                continue
            files+=1
            uncompressed+=info.file_size
            compressed+=info.compress_size
            ext[Path(name).suffix.lower() or "[no_extension]"]+=1
            top[parts[0] if parts else "[root]"]+=1
            base=Path(name).name.lower()
            if any(h in base for h in MANIFEST_HINTS) and info.file_size<=MAX_METADATA:
                metadata.append({"member":name,"bytes":info.file_size})
                if len(previews)<20:
                    try:
                        raw=z.read(info)
                        text=raw.decode("utf-8-sig")
                        suffix=Path(name).suffix.lower()
                        if suffix==".json":
                            obj=json.loads(text)
                            preview={"member":name,"kind":"json","keys":list(obj)[:80] if isinstance(obj,dict) else "json-array"}
                        elif suffix in (".csv",".tsv"):
                            preview={"member":name,"kind":suffix[1:],"header_and_sample_rows":[x[:500] for x in text.splitlines()[:4]]}
                        elif suffix in (".txt",".md",".yaml",".yml"):
                            preview={"member":name,"kind":suffix[1:],"first_lines":[x[:500] for x in text.splitlines()[:12]]}
                        else:
                            continue
                        previews.append(preview)
                    except (UnicodeDecodeError,json.JSONDecodeError,RuntimeError):
                        previews.append({"member":name,"kind":"unparsed_metadata"})
    return {
        "archive_name":archive.name,"archive_bytes":archive.stat().st_size,
        "archive_sha256":sha256(archive),"member_count":files,
        "uncompressed_bytes":uncompressed,"compressed_member_bytes":compressed,
        "compression_ratio":round(uncompressed/max(compressed,1),3),
        "extension_counts":dict(sorted(ext.items())),
        "top_level_member_counts":dict(sorted(top.items())),
        "metadata_candidates":metadata[:200],"metadata_previews":previews,
        "suspicious_member_path_count":suspicious,"extract_performed":False
    }

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--archive",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    a=p.parse_args()
    if not a.archive.is_file():
        p.error("Archive does not exist")
    report=inspect(a.archive)
    out=a.out.resolve()
    if out.exists():
        p.error("Output exists; choose a new versioned report path")
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+chr(10),encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k not in ("metadata_previews","metadata_candidates")},indent=2))
    if report["suspicious_member_path_count"]:
        raise SystemExit("Archive contains suspicious member paths; do not extract without review")

if __name__=="__main__":
    main()
