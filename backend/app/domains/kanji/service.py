"""Kanji service for business logic."""
from __future__ import annotations

from typing import List, Dict, Any, Optional

from .ports import KanjiRepositoryPort
from .schemas import (
    KanjiSearchRequest,
    KanjiSearchResult,
    KanjiSearchResponse,
    UpdateKanjiJlptRequest,
    UpdateKanjiJlptResponse,
)


class KanjiService:
    def __init__(self, repository: KanjiRepositoryPort) -> None:
        self._repository = repository

    def search_kanji(self, req: KanjiSearchRequest) -> KanjiSearchResponse:
        """Search for kanji by character or meaning."""
        results_raw = self._repository.search_kanji(req.query, limit=20)
        results = [
            KanjiSearchResult(
                kanji=r.get('kanji', ''),
                meanings=r.get('meanings', []),
                jlpt=r.get('jlpt'),
            )
            for r in results_raw
        ]
        return KanjiSearchResponse(results=results)

    def get_kanji_info(self, kanji_char: str) -> Dict[str, Any]:
        """Get detailed information about a specific kanji."""
        return self._repository.get_kanji_info(kanji_char)

    def update_jlpt_level(self, req: UpdateKanjiJlptRequest) -> UpdateKanjiJlptResponse:
        """Update the JLPT level of a kanji."""
        old_jlpt, new_jlpt = self._repository.update_jlpt_level(req.kanji, req.jlpt_level)
        return UpdateKanjiJlptResponse(
            success=True,
            kanji=req.kanji,
            old_jlpt=old_jlpt,
            new_jlpt=new_jlpt,
        )
