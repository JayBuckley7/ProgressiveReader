"""Kanji repository adapter backed by a JSON file.

The domain's use-cases depend on `KanjiRepositoryPort`; the file format + path
resolution belong here (adapter layer).
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from ..ports import KanjiRepositoryPort


class JsonFileKanjiRepository(KanjiRepositoryPort):
    def __init__(self, kanji_data_path: str) -> None:
        self._kanji_data_path = kanji_data_path

    def _load_kanji_data(self) -> Dict[str, Any]:
        if not os.path.exists(self._kanji_data_path):
            raise FileNotFoundError(f"Kanji database not found at {self._kanji_data_path}")
        with open(self._kanji_data_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _save_kanji_data(self, data: Dict[str, Any]) -> None:
        with open(self._kanji_data_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    def search_kanji(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        kanji_data = self._load_kanji_data()
        kanjis = kanji_data.get("kanjis", {})
        results: List[Dict[str, Any]] = []

        # Search by exact kanji match first
        if query in kanjis:
            kanji_info = kanjis[query].copy()
            kanji_info["kanji"] = query
            results.append(kanji_info)

        # Then search by meanings (limit to specified results)
        if len(results) == 0:
            query_lower = query.lower()
            for kanji_char, kanji_info in kanjis.items():
                if len(results) >= limit:
                    break
                meanings = kanji_info.get("meanings", [])
                if any(query_lower in meaning.lower() for meaning in meanings):
                    result = kanji_info.copy()
                    result["kanji"] = kanji_char
                    results.append(result)

        return results

    def get_kanji_info(self, kanji_char: str) -> Dict[str, Any]:
        if len(kanji_char) != 1:
            raise ValueError("kanji must be exactly one character")

        kanji_data = self._load_kanji_data()
        kanjis = kanji_data.get("kanjis", {})

        if kanji_char not in kanjis:
            raise ValueError(f"Kanji {kanji_char} not found")

        kanji_info = kanjis[kanji_char].copy()
        kanji_info["kanji"] = kanji_char
        return kanji_info

    def update_jlpt_level(self, kanji: str, jlpt_level: Optional[int]) -> tuple[Optional[int], Optional[int]]:
        if len(kanji) != 1:
            raise ValueError("kanji must be exactly one character")

        kanji_data = self._load_kanji_data()
        kanjis = kanji_data.get("kanjis", {})

        if kanji not in kanjis:
            raise ValueError(f"Kanji {kanji} not found in database")

        # Create backup
        backup_path = self._kanji_data_path + ".backup"
        with open(self._kanji_data_path, "r", encoding="utf-8") as src:
            with open(backup_path, "w", encoding="utf-8") as dst:
                dst.write(src.read())

        old_jlpt = kanjis[kanji].get("jlpt")
        kanjis[kanji]["jlpt"] = jlpt_level
        self._save_kanji_data(kanji_data)

        return (old_jlpt, jlpt_level)


__all__ = ["JsonFileKanjiRepository"]

