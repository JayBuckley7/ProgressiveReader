from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterator, Optional


class TranslationProvider(ABC):
    """Port for translation providers (OpenAI, Anthropic, etc.)."""

    @abstractmethod
    def translate_chapter(
        self,
        *,
        content: str,
        target_lang: str,
        use_cefr: bool = False,
        cefr_level: Optional[str] = None,
        model: Optional[str] = None,
    ) -> str:
        raise NotImplementedError

    @abstractmethod
    def stream_translate_chapter(
        self,
        *,
        content: str,
        target_lang: str,
        use_cefr: bool = False,
        cefr_level: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Iterator[str]:
        raise NotImplementedError

    @abstractmethod
    def translate_vocabulary(
        self,
        *,
        content: str,
        target_lang: str,
        model: Optional[str] = None,
    ) -> str:
        raise NotImplementedError


__all__ = ["TranslationProvider"]

