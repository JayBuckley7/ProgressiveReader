from __future__ import annotations

from typing import Callable, Iterator

from bs4 import BeautifulSoup

from .ports import TranslationProvider
from .schemas import (
    TranslateRequest,
    TranslateResponse,
    TranslateSegmentsRequest,
    TranslateSegmentsResponse,
    TranslatedSegment,
)
from ...core.markdown_fences import StreamFenceStripper, strip_markdown_code_fences


_SEGMENT_TAG = "pr-translation-segment"


class SegmentBoundaryError(RuntimeError):
    """The provider response cannot be mapped safely back to source segments."""


def _build_segment_batch(req: TranslateSegmentsRequest) -> str:
    """Wrap segments so the existing HTML translator can process them in one call."""
    parts = ["<pr-translation-batch>"]
    for index, segment in enumerate(req.segments):
        parts.append(f'<{_SEGMENT_TAG} data-pr-index="{index}">{segment.html}</{_SEGMENT_TAG}>')
    parts.append("</pr-translation-batch>")
    return "".join(parts)


def _parse_segment_batch(req: TranslateSegmentsRequest, translated_batch: str) -> dict[int, str]:
    soup = BeautifulSoup(translated_batch, "html.parser")
    translated_by_index: dict[int, str] = {}
    invalid_indexes: set[int] = set()

    for node in soup.find_all(_SEGMENT_TAG):
        raw_index = node.attrs.get("data-pr-index")
        try:
            index = int(raw_index)
        except (TypeError, ValueError):
            continue
        if index < 0 or index >= len(req.segments) or index in invalid_indexes:
            continue
        if index in translated_by_index:
            # A repeated marker is ambiguous only for that segment. Preserve
            # the trustworthy mappings and repair this index alone.
            translated_by_index.pop(index, None)
            invalid_indexes.add(index)
            continue
        translated_html = node.decode_contents(formatter="minimal")
        # A blank boundary is unusable and must not replace readable source.
        # Treat it like an omitted marker so the one missing-only repair can
        # recover that segment without repaying for the rest of the page.
        if not translated_html.strip():
            continue
        translated_by_index[index] = translated_html

    return translated_by_index


def _response_from_segments(
    req: TranslateSegmentsRequest,
    translated_by_index: dict[int, str],
) -> TranslateSegmentsResponse:
    return TranslateSegmentsResponse(
        segments=[
            TranslatedSegment(
                id=segment.id,
                translated_html=translated_by_index[index],
                source_hash=segment.source_hash,
                model_used=req.model,
            )
            for index, segment in enumerate(req.segments)
            if index in translated_by_index
        ],
        model_used=req.model,
    )


def _translate_segments_with_repair(
    req: TranslateSegmentsRequest,
    translate_batch: Callable[[TranslateSegmentsRequest], str],
) -> TranslateSegmentsResponse:
    translated_by_index = _parse_segment_batch(req, translate_batch(req))
    missing_indexes = [
        index for index in range(len(req.segments)) if index not in translated_by_index
    ]

    if missing_indexes:
        repair_req = req.model_copy(
            update={"segments": [req.segments[index] for index in missing_indexes]}
        )
        repaired = _parse_segment_batch(repair_req, translate_batch(repair_req))
        for repair_index, translated_html in repaired.items():
            translated_by_index[missing_indexes[repair_index]] = translated_html

    # Return every boundary we can still map with certainty. The caller can
    # retain/cache this already-paid work and retry only the missing segment
    # IDs; source text remains visible until the page is complete.
    return _response_from_segments(req, translated_by_index)


class TranslationService:
    def __init__(self, provider: TranslationProvider) -> None:
        self._provider = provider

    def translate_chapter(self, req: TranslateRequest) -> TranslateResponse:
        target = req.target_lang or "English"
        translated = self._provider.translate_chapter(
            content=req.content,
            target_lang=target,
            use_cefr=bool(req.use_cefr),
            cefr_level=req.cefr_level,
            model=req.model,
        )
        translated = strip_markdown_code_fences(translated)
        return TranslateResponse(translated_text=translated, model_used=req.model)

    def stream_translate_chapter(self, req: TranslateRequest) -> Iterator[str]:
        """Stream translation chunks for chapter content."""
        target = req.target_lang or "English"
        stripper = StreamFenceStripper()
        for part in self._provider.stream_translate_chapter(
            content=req.content,
            target_lang=target,
            use_cefr=bool(req.use_cefr),
            cefr_level=req.cefr_level,
            model=req.model,
        ):
            cleaned = stripper.feed(part)
            if cleaned:
                yield cleaned

        tail = stripper.flush()
        if tail:
            yield tail

    def translate_segments(self, req: TranslateSegmentsRequest) -> TranslateSegmentsResponse:
        """Translate a stable segment batch, repairing only missing boundaries once."""
        def translate_batch(batch: TranslateSegmentsRequest) -> str:
            batch_req = TranslateRequest(
                content=_build_segment_batch(batch),
                target_lang=batch.target_language,
                model=batch.model,
                cefr_level=batch.cefr_level,
                use_cefr=batch.use_cefr,
            )
            return self.translate_chapter(batch_req).translated_text

        return _translate_segments_with_repair(req, translate_batch)

    def stream_translate_segments(self, req: TranslateSegmentsRequest) -> TranslateSegmentsResponse:
        """Consume provider streams and repair only missing boundaries once."""
        def translate_batch(batch: TranslateSegmentsRequest) -> str:
            batch_req = TranslateRequest(
                content=_build_segment_batch(batch),
                target_lang=batch.target_language,
                model=batch.model,
                cefr_level=batch.cefr_level,
                use_cefr=batch.use_cefr,
            )
            return "".join(self.stream_translate_chapter(batch_req))

        return _translate_segments_with_repair(req, translate_batch)

    def translate_vocabulary(self, req: TranslateRequest) -> TranslateResponse:
        """Translate vocabulary (short words/phrases) with optimized settings."""
        target = req.target_lang or "English"
        translated = self._provider.translate_vocabulary(
            content=req.content,
            target_lang=target,
            model=req.model,
        )
        return TranslateResponse(translated_text=translated, model_used=req.model)
