#!/usr/bin/env python3
"""Stage the official Community-1 model locally after HF terms are accepted.

This script does NOT run during normal startup and never commits model data.
Requires HF_TOKEN (read permission) in the FTISU shell. HF's gated-model
access may require accepting conditions on the model webpage first.

 python inference/scripts/stage_pyannote_community.py --smoke-audio /path/to/consented-test.wav

Only creates the selection manifest after a real 16-kHz speech smoke test.
Runs on CPU for the smoke to avoid evicting a different GPU research job.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

REPO="pyannote/speaker-diarization-community-1"
OUTPUT=Path.home()/".local/share/isemotalk-diar/selected.json"

def main()->int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--smoke-audio",type=Path,required=True)
    args=parser.parse_args()
    source=args.smoke_audio.expanduser().resolve()
    if not source.is_file():
        raise SystemExit("Provide an authorized real recording for an end-to-end smoke test.")
    hf_token=os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if not hf_token:
        raise SystemExit("HF_TOKEN is not set; accept model conditions in your HF account and export it for this terminal only.")
    cache=Path.home()/".cache/huggingface"
    cache.mkdir(parents=True,exist_ok=True)
    if shutil.disk_usage(cache).free < 6*1024**3:
        raise SystemExit("Less than 6 GiB free in Hugging Face cache; no files removed or downloaded.")
    try:
        from huggingface_hub import HfApi,snapshot_download
        from pyannote.audio import Pipeline
        import torch
    except ImportError as exc:
        raise SystemExit("Requires pyannote.audio, huggingface_hub and torch in the FTISU Python venv: "+str(exc))
    info=HfApi().model_info(REPO,token=hf_token)
    rev=info.sha
    if not isinstance(rev,str) or len(rev)!=40 or any(c not in "0123456789abcdef" for c in rev):
        raise SystemExit("HF returned invalid revision; refusing unpinned model.")
    print("[diar] Download gated model to HF cache at immutable revision",rev,flush=True)
    snap=Path(snapshot_download(repo_id=REPO,revision=rev,token=hf_token)).resolve()
    if snap.name!=rev or not (snap/"config.yaml").is_file():
        raise SystemExit("Incomplete Community-1 snapshot; selection not created.")
    print("[diar] Loading locally; no external audio upload",flush=True)
    pipeline=Pipeline.from_pretrained(str(snap))
    pipeline.to(torch.device("cpu"))
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
    from app import audio
    mono=audio.decode(source,16000,1,max_bytes=128*1024*1024)
    if len(mono)<16000:
        raise SystemExit("Smoke audio shorter than one second.")
    result=pipeline({"waveform":torch.from_numpy(mono.copy()).unsqueeze(0),"sample_rate":16000},
                    min_speakers=1,max_speakers=2)
    from app.adapters.diarization import _segments_from_pyannote
    turns=_segments_from_pyannote(result,len(mono)/16000)
    if not turns:
        raise SystemExit("No speaker turns found in smoke recording; model not enabled.")
    print("[diar] Real speaker turns:",len(turns),"groups:",sorted(set(t["speakerId"] for t in turns)),flush=True)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    tmp=OUTPUT.with_suffix(".tmp")
    tmp.write_text(json.dumps({"model_id":REPO,"revision":rev,"local_dir":str(snap)},indent=2)+"\n",encoding="utf-8")
    os.chmod(tmp,0o600)
    tmp.replace(OUTPUT)
    print("[diar] Activated on next ISEmoTalk restart:",OUTPUT)
    print("[diar] Speaker A/B remain anonymous until a reviewer verifies roles.")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
