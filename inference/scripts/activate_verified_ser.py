#!/usr/bin/env python3
"""Select ONLY an already verified authentic SER checkpoint for serving.

Before this script, create the private serving factory/config + held-out
manifest and run:
  cd ~/services/isemotalk/inference
  ISEMO_SER_FACTORY=your_package.factory:build ISEMO_SER_CONFIG=/absolute/private/config.json \
    .venv/bin/python -m app.verify --manifest /absolute/private/eval.jsonl --min-macro-f1 0.60

Then:
  .venv/bin/python scripts/activate_verified_ser.py \
    --factory your_package.factory:build --config /absolute/private/config.json

This tool does not download, retrain, fabricate, select, or overwrite weights.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

OUTPUT=Path.home()/".local/share/isemotalk-ser/selected.json"
FACTORY=re.compile(r"[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*\Z")

def main()->int:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config",type=Path,required=True)
    ap.add_argument("--factory",required=True)
    args=ap.parse_args()
    if not FACTORY.fullmatch(args.factory):
        raise SystemExit("Expected Python factory path package.module:function.")
    cfg=args.config.expanduser().resolve()
    home=Path.home().resolve()
    if home not in cfg.parents or not cfg.is_file():
        raise SystemExit("Config must be an existing private file under FTISU HOME.")
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
    from app.adapters.ser_checkpoint import artifact_manifest,read_verification
    try:
        artifact_manifest(cfg,check_hashes=True)
        ok,detail=read_verification(cfg,args.factory,check_hashes=True)
        if not ok:
            raise ValueError(detail)
    except (ValueError,OSError) as exc:
        raise SystemExit("SER package not verified: "+str(exc))
    print("[ser] Verified artifact identity and held-out sanity record:",detail,flush=True)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    temporary=OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps({"factory":args.factory,"config":str(cfg)},indent=2)+"\n",encoding="utf-8")
    os.chmod(temporary,0o600)
    temporary.replace(OUTPUT)
    print("[ser] Enabled checkpoint on next ISEmoTalk runtime restart:",OUTPUT)
    print("[ser] This verifies the package, not prediction accuracy on live call-center recordings.")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
