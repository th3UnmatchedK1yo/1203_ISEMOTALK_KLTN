"""Group genuine Whisper word timestamps into short timestamped ASR spans.

A span is NOT a speaker turn. We do not infer caller/agent identities here.
Timestamps are obtained from the recognizer's word alignment, not assigned
by estimating positions from transcript characters.
"""
from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .adapters.base import Segment

MAX_WORDS = 25
MAX_SECONDS = 12.0
PAUSE_SECONDS = 0.75
SENTENCE_END = (".", "?", "!", "…", ";", "。", "؟")


def _join_words(parts: list[str]) -> str:
    rendered = ""
    for raw in parts:
        if not raw:
            continue
        if not rendered:
            rendered = raw.strip()
        elif raw[0].isspace():
            rendered += raw
        elif raw[0] in ".,!?:;…)]}":
            rendered += raw
        else:
            rendered += " " + raw
    return rendered.strip()


def timestamped_asr_spans(chunks: Iterable[dict[str, Any]], duration: float) -> list[Segment]:
    """Combine word chunks by silence, punctuation or a 12-second/25-word cap.

    Invalid or absent alignment is an explicit error; never create fictional
    per-sentence timestamps by splitting a long transcript by characters.
    """
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Invalid recording duration.")
    words: list[tuple[float, float, str]] = []
    for ch in chunks:
        raw = str(ch.get("text") or "")
        if not raw.strip():
            continue
        ts = ch.get("timestamp")
        if not isinstance(ts, (tuple, list)) or len(ts) != 2 or ts[0] is None:
            raise ValueError("Whisper word chunk is missing a start timestamp.")
        start = float(ts[0])
        end = float(ts[1]) if ts[1] is not None else duration
        if not (math.isfinite(start) and math.isfinite(end)) or start < 0 or start >= duration or end <= start:
            raise ValueError("Whisper returned invalid word timestamp.")
        if end > duration + 0.25:
            raise ValueError("Whisper word timestamp exceeds audio duration.")
        end = min(end, duration)
        if words and start + 0.1 < words[-1][0]:
            raise ValueError("Whisper word timestamps are not chronological.")
        words.append((start, end, raw))

    # Late import avoids a cycle when app.adapters imports asr_phowhisper.
    from .adapters.base import Segment
    result: list[Segment] = []
    parts: list[str] = []
    begin, last_end = 0.0, 0.0

    def flush() -> None:
        nonlocal parts
        text = _join_words(parts)
        if text and last_end > begin:
            result.append(Segment(round(begin, 2), round(last_end, 2), text))
        parts = []

    for start, end, raw in words:
        if parts and (start - last_end >= PAUSE_SECONDS or
                      start - begin >= MAX_SECONDS or len(parts) >= MAX_WORDS):
            flush()
        if not parts:
            begin = start
            last_end = start
        parts.append(raw)
        last_end = max(last_end, end)
        if raw.strip().endswith(SENTENCE_END) and last_end - begin >= 1.0:
            flush()
    if parts:
        flush()
    return result
