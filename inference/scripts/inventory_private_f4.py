#!/usr/bin/env python3
"""Read-only inventory of private F4/emotion2vec/PhoBERT candidate artifacts.

Does not load weights, recurse into venv/model caches, upload data or alter files.
Outputs only paths, sizes and modified times; student reviews candidates.
"""
from __future__ import annotations

import argparse
import os
from datetime import datetime
from pathlib import Path

WEIGHTS={'.pt','.pth','.ckpt','.safetensors','.bin'}
SKIP={'.git','.venv','venv','node_modules','.cache','datasets','audio','uploads','logs','__pycache__'}
KEYWORDS=('f4','ser','emotion','phobert','emotion2vec','rivf','checkpoint','paper')

def scan(root:Path,limit:int,depth:int)->list[tuple[int,float,Path]]:
    if not root.is_dir():return []
    items=[];visited=0
    for current,subdirs,files in os.walk(root,followlinks=False):
        current_path=Path(current)
        nested=len(current_path.relative_to(root).parts)
        subdirs[:]=[n for n in subdirs if n not in SKIP and nested<depth]
        for name in files:
            visited+=1
            if visited>limit:
                print(f"[inventory] Capped at {limit} inspected files under {root}")
                return items
            path=current_path/name
            lower=str(path).lower()
            if path.suffix.lower() not in WEIGHTS and not name.lower().endswith(('config.json','labels.json','verification.json')):
                continue
            if not any(key in lower for key in KEYWORDS):
                continue
            try:
                stat=path.stat()
                items.append((stat.st_size,stat.st_mtime,path))
            except (OSError,PermissionError):continue
    return items

def main()->int:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--max-files',type=int,default=40000)
    args=ap.parse_args()
    if not 100<=args.max_files<=100000:
        raise SystemExit('--max-files must be between 100 and 100000')
    home=Path.home()
    roots=[home/'research',home/'services/isemotalk-private']
    rows=[]
    for root in roots:rows+=scan(root,args.max_files,8)
    print("F4/Emotion serving candidates (NOT validated models):")
    for size,mtime,path in sorted(rows,key=lambda item:-item[0])[:80]:
        print(f"{size/(1024**2):8.1f} MiB | {datetime.fromtimestamp(mtime).isoformat(timespec='seconds')} | {path}")
    print(f"Found {len(rows)} matching files. Do not enable SER until factory, tokenizer, preprocessing, labels, weights and held-out manifest are verified together.")
    return 0

if __name__=='__main__':
    raise SystemExit(main())
