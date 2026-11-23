"""One-shot isolated pyannote inference worker.

Started only by trusted ISEmoTalk adapter with a staged private Python venv.
Reads a private 16 kHz mono WAV; prints only JSON speaker-turn evidence.
The process exits after inference, releasing model GPU/CPU memory.
"""
from __future__ import annotations

import argparse
import json
import wave
from pathlib import Path

import numpy as np

from .adapters.diarization import _segments_from_pyannote


def main()->int:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--wav',type=Path,required=True)
    ap.add_argument('--model-dir',type=Path,required=True)
    ap.add_argument('--device',choices=['cpu','cuda'],default='cpu')
    args=ap.parse_args()
    wav=args.wav.resolve()
    directory=args.model_dir.resolve()
    if not (directory/'config.yaml').is_file():
        raise SystemExit('Missing staged Community-1 config')
    with wave.open(str(wav),'rb') as fp:
        if fp.getnchannels()!=1 or fp.getframerate()!=16000 or fp.getsampwidth()!=2:
            raise SystemExit('Expected private 16 kHz mono PCM16')
        data=fp.readframes(fp.getnframes())
    if not data:
        raise SystemExit('Empty WAV')
    from pyannote.audio import Pipeline
    import torch
    array=np.frombuffer(data,dtype='<i2').astype(np.float32)/32768.0
    pipe=Pipeline.from_pretrained(str(directory))
    pipe.to(torch.device(args.device))
    out=pipe({'waveform':torch.from_numpy(array).unsqueeze(0),'sample_rate':16000},
             min_speakers=1,max_speakers=2)
    turns=_segments_from_pyannote(out,len(array)/16000.0)
    print(json.dumps({'turns':turns},ensure_ascii=False))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
