"""Inbound HTTP helpers for translation routes."""

from __future__ import annotations

import json
from typing import Iterator

from .schemas import TranslateRequest, TranslateSegmentsRequest
from .service import SegmentBoundaryError, TranslationService


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


def stream_translate_segments_sse(*, service: TranslationService, req: TranslateSegmentsRequest) -> Iterator[str]:
    """Yield complete translated segments as SSE after one batched provider stream."""
    yield "data: " + json.dumps({"status": "started", "segmentCount": len(req.segments)}) + "\n\n"

    try:
        result = service.stream_translate_segments(req)
    except SegmentBoundaryError as error:
        yield "data: " + json.dumps({"error": str(error), "code": "segment_boundary_error"}) + "\n\n"
        yield "data: [DONE]\n\n"
        return

    for segment in result.segments:
        yield "data: " + json.dumps({"segment": segment.model_dump(by_alias=True, exclude_none=True)}) + "\n\n"

    payload = result.model_dump(by_alias=True, exclude_none=True)
    yield "data: " + json.dumps({"complete": len(result.segments) == len(req.segments), **payload}) + "\n\n"
    yield "data: [DONE]\n\n"


__all__ = ["stream_translate_chapter_sse", "stream_translate_segments_sse"]

