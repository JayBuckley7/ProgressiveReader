from __future__ import annotations

from typing import List, Optional

from ..ports import JpdbProvider
from ..schemas import DueCard, Deck


class JpdbModuleProvider(JpdbProvider):
    def __init__(self, *, deck_id: str | None = None) -> None:
        self._deck_id = (deck_id or "").strip() or None

    def fetch_due_cards(
        self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]
    ) -> List[DueCard]:
        from .jpdb_due import fetch_all_due_cards

        cards = fetch_all_due_cards(
            username=username,
            password=password,
            cookie_string=cookie_string,
            deck_id=self._deck_id or "",
        ) or []
        return [DueCard(**c) for c in cards]

    def fetch_user_decks(
        self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]
    ) -> List[Deck]:
        from .jpdb_due import fetch_user_decks

        decks = fetch_user_decks(username=username, password=password, cookie_string=cookie_string) or []
        out: List[Deck] = []
        for d in decks:
            deck_id = d.get("id") or d.get("deck_id") or d.get("deckId")
            name = d.get("name")
            words = d.get("words") or d.get("word_count") or d.get("count")
            out.append(Deck(id=str(deck_id), name=name, words=words))
        return out


__all__ = ["JpdbModuleProvider"]
