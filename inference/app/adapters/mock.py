"""MOCK adapters. They exist to exercise the whole product without any model.

Everything they return is flagged as mock all the way to the UI. They are NOT a model of emotion:
the "lexical" scores are keyword counts and the "acoustic" scores are pseudo-random.
"""
from __future__ import annotations

import hashlib
import random
from typing import Optional

import numpy as np

from .base import EMOTIONS, AudioSlicer, Segment, SerItem, SerOutput, Status

_SCRIPT = [
    "Cảm ơn bạn đã gọi đến tổng đài, tôi có thể hỗ trợ gì cho bạn?",
    "Tôi muốn hỏi về đơn hàng của tôi, đã quá hạn giao mà vẫn chưa nhận được.",
    "Dạ, để tôi kiểm tra thông tin cho bạn ngay. Bạn vui lòng chờ một chút.",
    "Tôi đã gọi mấy lần rồi mà vẫn không ai giải quyết, tôi rất bực mình.",
    "Tôi rất xin lỗi vì sự bất tiện này, tôi sẽ ưu tiên xử lý ngay cho bạn.",
    "Hy vọng lần này là thật, tôi đã chờ rất lâu rồi.",
    "Đơn hàng sẽ được giao trong 24 giờ tới, tôi sẽ gửi mã theo dõi qua tin nhắn.",
    "Được rồi, cảm ơn bạn đã hỗ trợ nhiệt tình.",
    "Cảm ơn bạn đã kiên nhẫn, chúc bạn một ngày tốt lành!",
]


class MockAsr:
    name = "mock"
    mock = True

    def status(self) -> Status:
        return Status("mock", True, True, "Bản ghi mẫu cố định — không nhận dạng giọng nói thật.")

    def transcribe(self, wave: np.ndarray, sample_rate: int, duration: float) -> list[Segment]:
        n = max(2, min(len(_SCRIPT), int(duration // 6)))
        step = duration / n
        return [
            Segment(round(i * step, 2), round((i + 1) * step - 0.3, 2), _SCRIPT[i % len(_SCRIPT)],
                    "agent" if i % 2 == 0 else "customer")
            for i in range(n)
        ]


class MockDiarizer:
    name = "mock"
    mock = True

    def status(self) -> Status:
        return Status("mock", True, True, "Gán người nói xen kẽ — không phải kết quả thật.")

    def diarize(self, wave: np.ndarray, sample_rate: int, segments: list[Segment]) -> Optional[list[str]]:
        return ["agent" if i % 2 == 0 else "customer" for i in range(len(segments))]


_KEYWORDS = {
    "angry": ["bực", "tức", "giận", "không chấp nhận", "làm ăn kiểu gì", "lần nào cũng", "quá đáng", "khiếu nại", "vô trách nhiệm", "!"],
    "sad": ["thất vọng", "buồn", "chán", "mệt mỏi", "chờ rất lâu", "không được quan tâm", "ước gì", "hy vọng"],
    "happy": ["cảm ơn", "tuyệt", "hài lòng", "tốt quá", "chúc", "vui", "nhiệt tình"],
}


def _softmax(xs: list[float]) -> list[float]:
    m = max(xs)
    es = [np.exp(x - m) for x in xs]
    s = sum(es)
    return [float(e / s) for e in es]


def lexical_probs(text: str) -> list[float]:
    low = text.lower()
    scores = [1.2, 0.0, 0.0, 0.0]  # neutral prior
    for emo, words in _KEYWORDS.items():
        scores[EMOTIONS.index(emo)] += 1.6 * sum(w in low for w in words)
    return _softmax(scores)


class MockSer:
    name = "mock"
    mock = True

    def status(self) -> Status:
        return Status("mock", True, True, "Điểm số mô phỏng (từ khóa + ngẫu nhiên có hạt giống) — KHÔNG phải mô hình cảm xúc thật.", verified=False)

    def predict(self, items: list[SerItem], audio: AudioSlicer) -> list[SerOutput]:
        out = []
        for it in items:
            lex = lexical_probs(it.text)
            seed = int(hashlib.sha1(f"{it.id}|{it.text}|{it.start:.2f}".encode()).hexdigest()[:8], 16)
            rnd = random.Random(seed)
            lead = max(range(4), key=lex.__getitem__)
            if rnd.random() < 0.78:  # mostly agrees with the text, like a plausible acoustic model
                ac = [0.08 + rnd.random() * 0.1 for _ in range(4)]
                ac[lead] += 0.55 + rnd.random() * 0.25
            else:
                other = rnd.choice([i for i in range(4) if i != lead])
                ac = [0.1 + rnd.random() * 0.1 for _ in range(4)]
                ac[other] += 0.5 + rnd.random() * 0.3
            ac = [x / sum(ac) for x in ac]
            fused = [0.5 * a + 0.5 * l for a, l in zip(ac, lex)]
            out.append(SerOutput(fused=fused, acoustic=ac, lexical=lex))
        return out
