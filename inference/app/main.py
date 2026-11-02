"""FastAPI inference service for ISEmoTalk. Local-only: bind to 127.0.0.1."""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import audio
from .adapters import build_asr, build_diarizer, build_ser
from .adapters.base import ModelNotReady
from .config import Settings
from .service import InferenceService, PathNotAllowed


class PathBody(BaseModel):
    path: str


class TranscribeBody(PathBody):
    agent_channel: int = Field(0, ge=0, le=1)


class SegmentIn(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    text: str = ""


class DiarizeBody(PathBody):
    segments: list[SegmentIn] = Field(max_length=5000)


class UtteranceIn(SegmentIn):
    id: str
    speaker: str = "unknown"


class EmotionBody(PathBody):
    utterances: list[UtteranceIn] = Field(min_length=1, max_length=5000)
    agent_channel: int = Field(0, ge=0, le=1)


def create_app(settings: Optional[Settings] = None, service: Optional[InferenceService] = None) -> FastAPI:
    settings = settings or Settings.load()
    svc = service or InferenceService(settings, build_asr(settings), build_diarizer(settings), build_ser(settings))
    app = FastAPI(title="ISEmoTalk inference", version="0.1.0")
    app.state.service = svc

    @app.exception_handler(ModelNotReady)
    async def _not_ready(_: Request, e: ModelNotReady):
        return JSONResponse(status_code=503, content={"detail": {"code": "model_not_ready", "message": str(e)}})

    @app.exception_handler(audio.AudioError)
    async def _bad_audio(_: Request, e: audio.AudioError):
        return JSONResponse(status_code=400, content={"detail": {"code": "bad_audio", "message": str(e)}})

    @app.exception_handler(PathNotAllowed)
    async def _forbidden(_: Request, e: PathNotAllowed):
        return JSONResponse(status_code=403, content={"detail": {"code": "forbidden_path", "message": str(e)}})

    @app.get("/v1/health")
    def health():
        return svc.health()

    @app.post("/v1/audio/probe")
    def probe(body: PathBody):
        return svc.probe(body.path)

    @app.post("/v1/transcribe")
    def transcribe(body: TranscribeBody):
        return svc.transcribe(body.path, body.agent_channel)

    @app.post("/v1/diarize")
    def diarize(body: DiarizeBody):
        return svc.diarize(body.path, [s.model_dump() for s in body.segments])

    @app.post("/v1/emotion")
    def emotion(body: EmotionBody):
        ids = [u.id for u in body.utterances]
        if len(set(ids)) != len(ids):
            raise HTTPException(status_code=422, detail="Mã câu nói bị trùng.")
        return svc.emotion(body.path, [u.model_dump() for u in body.utterances], body.agent_channel)

    return app


app = create_app()
