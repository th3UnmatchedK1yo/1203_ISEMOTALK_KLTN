"""The local warmup route targets the same adapter used by live requests."""
import unittest
import httpx

from app.adapters.mock import MockAsr, MockSer
from app.adapters.diarization import NoDiarizer
from app.config import Settings
from app.main import create_app
from app.service import InferenceService


class ReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_warmup_refuses_other_adapters_without_loading_them(self):
        settings = Settings.load()
        service = InferenceService(settings, MockAsr(), NoDiarizer(), MockSer())
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(settings=settings, service=service)), base_url="http://test") as client:
            res = await client.post("/v1/warmup")
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.json()["detail"]["code"], "model_not_ready")

    async def test_nonfinite_json_returns_controlled_client_error(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(), raise_app_exceptions=False), base_url="http://test") as client:
            res = await client.post("/v1/emotion", content='{"path":"missing.wav","utterances":[{"id":"one","start":0,"end":Infinity}]}', headers={"Content-Type": "application/json"})
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()["detail"]["code"], "bad_input")


if __name__ == "__main__":
    unittest.main()
