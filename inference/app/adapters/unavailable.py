"""Explicitly unavailable adapters for honest, partial real-model deployments.

These do NOT produce fake transcript, emotion, or confidence values.
They allow independently trained QA and ASR to be served while the research
F4 package awaits a separate verification gate.
"""
from __future__ import annotations

from typing import Callable

import numpy as np

from .base import ModelNotReady, Segment, SerItem, SerOutput, Status


class UnavailableAsr:
    name = "not_configured"
    mock = False

    def status(self) -> Status:
        return Status(self.name, False, False,
                      "ASR chưa được cấu hình: chỉ chạy QA từ transcript đã có, không tạo transcript giả.")

    def transcribe(self, wave: np.ndarray, sample_rate: int, duration: float) -> list[Segment]:
        raise ModelNotReady("ASR chưa sẵn sàng. Không thể tự phân tích ghi âm chưa có transcript.")


class UnavailableSer:
    name = "not_configured"
    mock = False

    def status(self) -> Status:
        return Status(self.name, False, False,
                      "SER F4 chưa được xác minh. Không tạo nhãn cảm xúc hoặc fusion giả.")

    def predict(self, items: list[SerItem], audio: Callable) -> list[SerOutput]:
        raise ModelNotReady("SER chưa được xác minh; không thể suy luận cảm xúc.")
