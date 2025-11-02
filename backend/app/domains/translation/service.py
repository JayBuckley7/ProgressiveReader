from __future__ import annotations

from typing import Optional, Iterator

from .integrations import TranslationProvider
from .schemas import TranslateRequest, TranslateResponse


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
        return TranslateResponse(translated_text=translated, model_used=req.model)

    def stream_translate_chapter(self, req: TranslateRequest) -> Iterator[str]:
        """Stream translation chunks for chapter content."""
        target = req.target_lang or "English"
        if hasattr(self._provider, 'stream_translate_chapter'):
            yield from self._provider.stream_translate_chapter(
                content=req.content,
                target_lang=target,
                use_cefr=bool(req.use_cefr),
                cefr_level=req.cefr_level,
                model=req.model,
            )
        else:
            # Fallback: translate non-streaming and yield entire result
            result = self.translate_chapter(req)
            yield result.translated_text

    def translate_vocabulary(self, req: TranslateRequest) -> TranslateResponse:
        """Translate vocabulary (short words/phrases) with optimized settings."""
        target = req.target_lang or "English"
        if hasattr(self._provider, 'translate_vocabulary'):
            translated = self._provider.translate_vocabulary(
                content=req.content,
                target_lang=target,
            )
        else:
            # Fallback to chapter translation with vocabulary-optimized settings
            translated = self._provider.translate_chapter(
                content=req.content,
                target_lang=target,
                use_cefr=False,
                cefr_level=None,
                model=req.model or "gpt-3.5-turbo",
            )
        return TranslateResponse(translated_text=translated, model_used=req.model)


