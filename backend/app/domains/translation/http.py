"""Inbound HTTP helpers for translation routes."""

from __future__ import annotations

import json
from typing import Iterator

from .schemas import TranslateRequest
from .service import TranslationService


def stream_translate_chapter_sse(*, service: TranslationService, req: TranslateRequest) -> Iterator[str]:
    """Yield Server-Sent Events (SSE) messages for a streaming chapter translation."""
    translated = ""
    yield "data: {\"status\": \"started\"}\n\n"

    for part in service.stream_translate_chapter(req):
        if not part:
            continue
        translated += part
        yield f"data: {json.dumps({'content': part})}\n\n"

    yield "data: " + json.dumps({"complete": True, "translated_text": translated}) + "\n\n"
    yield "data: [DONE]\n\n"


__all__ = ["stream_translate_chapter_sse"]

