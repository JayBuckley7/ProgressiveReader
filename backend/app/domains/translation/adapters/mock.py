from __future__ import annotations

from typing import Iterator, Optional

from ..ports import TranslationProvider


class MockProvider(TranslationProvider):
    """Simple mock for tests and local development."""

    def translate_chapter(
        self,
        *,
        content: str,
        target_lang: str,
        use_cefr: bool = False,
        cefr_level: Optional[str] = None,
        model: Optional[str] = None,
    ) -> str:
        return (
            f"<div>MOCK({target_lang}{' CEFR:'+str(cefr_level) if use_cefr and cefr_level else ''}) "
            f"{len(content)}</div>"
        )

    def stream_translate_chapter(
        self,
        *,
        content: str,
        target_lang: str,
        use_cefr: bool = False,
        cefr_level: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Iterator[str]:
        yield self.translate_chapter(
            content=content,
            target_lang=target_lang,
            use_cefr=use_cefr,
            cefr_level=cefr_level,
            model=model,
        )

    def translate_vocabulary(
        self,
        *,
        content: str,
        target_lang: str,
        model: Optional[str] = None,
    ) -> str:
        return f"MOCK({target_lang}) {content}"


__all__ = ["MockProvider"]

