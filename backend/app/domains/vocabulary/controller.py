"""Inbound controller for vocabulary routes (keeps Flask routes thin)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional

from .http import get_jpdb_api_key_from_cookies_or_body
from .schemas import (
    ListUserDecksRequest,
    GetJpdbDataRequest,
    MineWordRequest,
    UpdateWordStateRequest,
    ReviewCardRequest,
    AddVocabularyWordRequest,
    ToggleMasteredRequest,
)
from .service import VocabularyService


@dataclass(frozen=True)
class VocabularyController:
    service: VocabularyService

    def due_cards(self, *, payload: dict[str, Any], cookie_header: Optional[str]) -> list[dict]:
        req = ListUserDecksRequest(**payload)
        cookie_string = req.cookie or cookie_header
        if not (req.username or req.password or cookie_string):
            raise PermissionError("Authentication required")
        cards = self.service.get_due_cards_with_auth(request=req, cookie_string=cookie_string)
        return [c.model_dump() for c in cards]

    def list_user_decks(
        self,
        *,
        payload: dict[str, Any],
        cookies: Mapping[str, str],
        cookie_header: Optional[str],
    ) -> list[dict]:
        req = ListUserDecksRequest(**payload)
        cookie_string = req.cookie or cookie_header
        jpdb_api_key = get_jpdb_api_key_from_cookies_or_body(cookies=cookies, body=payload)
        decks = self.service.list_user_decks_with_auth(request=req, cookie_string=cookie_string, jpdb_api_key=jpdb_api_key)
        return [d.model_dump() for d in decks]

    def jpdb_list_deck_vocabulary(self, *, payload: dict[str, Any], cookies: Mapping[str, str]) -> dict:
        deck_id = payload.get("id")
        if deck_id is None or (isinstance(deck_id, str) and not deck_id.strip()):
            raise ValueError("Missing deck id")
        if isinstance(deck_id, str):
            deck_id = deck_id.strip()
            if deck_id.isdigit():
                deck_id = int(deck_id)

        jpdb_api_key = get_jpdb_api_key_from_cookies_or_body(cookies=cookies, body=payload)
        if not jpdb_api_key:
            raise PermissionError("JPDB API key not configured")

        vocab = self.service.list_deck_vocabulary_via_api_key(jpdb_api_key=jpdb_api_key, deck_id=deck_id)
        return {"vocabulary": vocab}

    def jpdb_lookup_vocabulary(self, *, payload: dict[str, Any], cookies: Mapping[str, str]) -> dict:
        jpdb_api_key = get_jpdb_api_key_from_cookies_or_body(cookies=cookies, body=payload)
        if not jpdb_api_key:
            raise PermissionError("JPDB API key not configured")

        combined = self.service.lookup_vocabulary_info_via_api_key(
            jpdb_api_key=jpdb_api_key,
            pairs=payload.get("list"),
            fields=payload.get("fields"),
            chunk_size=payload.get("chunkSize") or 300,
        )
        return {"vocabulary_info": combined}

    def get_jpdb_data(self, *, payload: dict[str, Any]) -> list[dict]:
        req = GetJpdbDataRequest(**payload)
        tokens = self.service.get_jpdb_data(request=req)
        return [t.model_dump() for t in tokens]

    def mine_jpdb_word(self, *, payload: dict[str, Any]) -> dict:
        req = MineWordRequest(**payload)
        result = self.service.mine_word(request=req)
        if isinstance(result, dict) and result.get("success") is True:
            return result
        return {"success": False, "error": "JPDB mining failed"}

    def update_jpdb_word_state(self, *, payload: dict[str, Any]) -> dict:
        req = UpdateWordStateRequest(**payload)
        new_state = self.service.update_word_state_with_predicted_state(request=req)
        return {"success": True, "newState": new_state}

    def review_jpdb_card(self, *, payload: dict[str, Any]) -> dict:
        req = ReviewCardRequest(**payload)
        new_state = self.service.review_card_with_predicted_state(request=req)
        return {"success": True, "newState": new_state}

    def add_vocabulary_word(self, *, payload: dict[str, Any], user_id: Optional[str]) -> tuple[dict, int]:
        req = AddVocabularyWordRequest(**payload)
        vocab = self.service.add_vocabulary_word(request=req, user_id=user_id)
        return (
            {
                "success": True,
                "id": vocab.id,
                "word": vocab.word,
                "translation": vocab.translation,
                "language": vocab.language,
            },
            201,
        )

    def get_user_vocabulary(
        self,
        *,
        user_id: Optional[str],
        language: Optional[str],
        mastered: Optional[bool],
        book_id: Optional[str],
    ) -> list[dict]:
        vocabulary = self.service.get_user_vocabulary(
            user_id=user_id,
            language=language,
            mastered=mastered,
            book_id=book_id,
        )
        return [v.model_dump() for v in vocabulary]

    def toggle_mastered(self, *, payload: dict[str, Any], user_id: Optional[str], word_id: int) -> dict | None:
        req = ToggleMasteredRequest(**payload)
        vocab = self.service.toggle_mastered(user_id=user_id, word_id=word_id, mastered=req.mastered)
        return vocab.model_dump() if vocab else None


__all__ = ["VocabularyController"]
