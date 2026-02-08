from __future__ import annotations

from typing import Iterator

from .ports import TranslationProvider
from .schemas import TranslateRequest, TranslateResponse
from ...core.markdown_fences import StreamFenceStripper, strip_markdown_code_fences


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

    def translate_vocabulary(self, req: TranslateRequest) -> TranslateResponse:
        """Translate vocabulary (short words/phrases) with optimized settings."""
        target = req.target_lang or "English"
        translated = self._provider.translate_vocabulary(
            content=req.content,
            target_lang=target,
            model=req.model,
        )
        return TranslateResponse(translated_text=translated, model_used=req.model)
