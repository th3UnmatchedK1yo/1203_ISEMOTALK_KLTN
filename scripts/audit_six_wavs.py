#!/usr/bin/env python3
"""Read-only demo audit for call_01.wav..call_06.wav on FTISU.

Run when the UI is already serving:
  python scripts/audit_six_wavs.py --api http://127.0.0.1:3102

No data is changed or removed. Model status is reported from existing call
stage evidence, not from a guessed filesystem checkpoint.
"""
from __future__ import annotations

import argparse
import json
import re
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import URLError

FILES=[f"call_{i:02}.wav" for i in range(1,7)]

def main()->int:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--api",default="http://127.0.0.1:3102")
    args=ap.parse_args()
    if not re.fullmatch(r"http://127[.]0[.]0[.]1:[0-9]{4,5}",args.api):
        raise SystemExit("Only local FTISU loopback API allowed.")
    def get(path):
        with urlopen(args.api+path,timeout=10) as response:
            return json.load(response)
    try:
        records=[]
        for page in range(1,21):
            body=get("/api/calls?"+urlencode({"page":page,"pageSize":100,"datasetScope":"all","sort":"date"}))
            batch=body.get("items",[])
            records+=batch
            if not batch or page*100>=body.get("total",0):
                break
        identified={}
        for row in records:
            title=str(row.get("title","")).lower()
            match=next((f for f in FILES if title==f or title.startswith(f+" ")),None)
            if not match:
                continue
            key=str(row.get("updatedAt",""))
            if match not in identified or key>str(identified[match].get("updatedAt","")):
                identified[match]=row
        print("FILE        CALL-ID      STATUS     ASR     TURNS  SER     XLM-R")
        print("-"*79)
        finished=0
        for filename in FILES:
            row=identified.get(filename)
            if not row:
                print(filename.ljust(12)+"(not present)")
                continue
            call=get("/api/calls/"+row["id"])
            stages={s.get("stage"):s for s in call.get("stageLog",[])}
            asr=stages.get("transcribe",{})
            diar=stages.get("diarize",{})
            ser=stages.get("emotion",{})
            turns=len((diar.get("evidence") or {}).get("speakerTurns") or [])
            ser_ok=ser.get("state")=="done" and (ser.get("evidence") or {}).get("verified") is True
            score="—"
            if call.get("status")=="ready":
                try:
                    qa=get("/api/calls/"+row["id"]+"/qa-triage")
                    result=qa.get("result")
                    if result and not qa.get("outdated"):
                        score=("%.4f" % result.get("score",0))+" (screening)"
                except Exception: pass
            if call.get("status")=="ready":finished+=1
            print("%-11s %-12s %-10s %-7s %-6d %-7s %s"%(filename,row["id"],call.get("status"),
                asr.get("state","—"),turns,"verified" if ser_ok else "no",score))
            if call.get("error"):
                print("    ERROR:",str(call["error"])[:200])
            elif asr.get("evidence"):
                print("    ASR:",str(asr["evidence"].get("model","unknown"))[:130])
                if asr["evidence"].get("timingMode")=="audio_window":
                    print("    WARNING: coarse audio-window timestamps, not turn boundaries")
        print(f"\nReady: {finished}/6. This is a processing count, NOT model accuracy.")
        try:
            llm=get("/api/insights/status")
            print("Local LLM:","ready" if llm.get("enabled") else "not enabled",llm.get("model") or "")
        except Exception as exc:print("LLM status unreadable:",str(exc)[:80])
        return 0 if finished==6 else 1
    except (URLError,ValueError,KeyError) as exc:
        raise SystemExit("Cannot audit local ISEmoTalk API: "+str(exc))

if __name__=="__main__":
    raise SystemExit(main())
