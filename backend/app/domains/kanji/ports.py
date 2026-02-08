from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class KanjiRepositoryPort(ABC):
    @abstractmethod
    def search_kanji(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def get_kanji_info(self, kanji_char: str) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_jlpt_level(self, kanji: str, jlpt_level: Optional[int]) -> tuple[Optional[int], Optional[int]]:
        raise NotImplementedError


__all__ = ["KanjiRepositoryPort"]

