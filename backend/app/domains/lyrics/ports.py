from __future__ import annotations

from abc import ABC, abstractmethod


class LyricsPageProviderPort(ABC):
    @abstractmethod
    def fetch_kanji_lyrics(self, url: str) -> dict[str, str]:
        raise NotImplementedError


__all__ = ["LyricsPageProviderPort"]
