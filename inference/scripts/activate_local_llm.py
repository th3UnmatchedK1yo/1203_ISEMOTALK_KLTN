#!/usr/bin/env python3
"""Opt-in to an existing local Ollama model. Does not install or download it.

1) Install Ollama on FTISU after checking machine policy and disk usage.
2) Start it on loopback, preferably CPU when GPU is busy:
     OLLAMA_HOST=127.0.0.1:11434 OLLAMA_NUM_GPU=0 ollama serve
3) In a separate terminal: ollama pull qwen2.5:3b-instruct
4) Then run: python inference/scripts/activate_local_llm.py --model qwen2.5:3b-instruct

No external API keys and no upload of private transcript to any cloud.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from urllib.request import urlopen

OUTPUT=Path.home()/".local/share/isemotalk-llm/selected.json"

def main()->int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model",default="qwen2.5:3b-instruct")
    args=parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9._:/-]{2,100}",args.model):
        raise SystemExit("Invalid model name.")
    try:
        with urlopen("http://127.0.0.1:11434/v1/models",timeout=5) as response:
            models=json.load(response).get("data",[])
    except Exception as exc:
        raise SystemExit("Local Ollama is not reachable at 127.0.0.1:11434: "+str(exc))
    if args.model not in [r.get("id") for r in models if isinstance(r,dict)]:
        raise SystemExit("Model not listed by local Ollama. Pull an approved model first; no automatic downloads.")
    OUTPUT.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    temp=OUTPUT.with_suffix(".tmp")
    temp.write_text(json.dumps({"model":args.model},indent=2)+"\n",encoding="utf-8")
    os.chmod(temp,0o600)
    temp.replace(OUTPUT)
    print("Local LLM configured for next ISEmoTalk restart:",args.model)
    print("Human QA remains responsible for conclusions and checking evidence.")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
