from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any

from .schemas import DueCard, Deck


class JpdbProvider(ABC):
    @abstractmethod
    def fetch_due_cards(self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]) -> List[DueCard]:
        raise NotImplementedError

    @abstractmethod
    def fetch_user_decks(self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]) -> List[Deck]:
        raise NotImplementedError


class JpdbModuleProvider(JpdbProvider):
    def fetch_due_cards(self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]) -> List[DueCard]:
        from ...utils.jpdb_due import fetch_all_due_cards

        cards = fetch_all_due_cards(username=username, password=password, cookie_string=cookie_string) or []
        return [DueCard(**c) for c in cards]

    def fetch_user_decks(self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]) -> List[Deck]:
        from ...utils.jpdb_due import fetch_user_decks

        decks = fetch_user_decks(username=username, password=password, cookie_string=cookie_string) or []
        # normalize keys if needed
        out: List[Deck] = []
        for d in decks:
            deck_id = d.get('id') or d.get('deck_id') or d.get('deckId')
            name = d.get('name')
            words = d.get('words') or d.get('word_count') or d.get('count')
            out.append(Deck(id=str(deck_id), name=name, words=words))
        return out


class JpdbApiProvider(ABC):
    @abstractmethod
    def post_tokens_batch(
        self,
        *,
        text_batch: List[str],
        token_fields: List[str],
        vocab_fields: List[str],
        api_url: str,
        headers: Dict[str, str],
        timeout_connect: float = 5.0,
        timeout_read: float = 30.0,
    ) -> Dict[str, Any]:
        """Send a single JPDB request for tokens/vocabulary and return parsed JSON dict."""
        raise NotImplementedError

    @abstractmethod
    def mine_word(self, *, vid: int, sid: int, jpdb_api_key: str, mining_deck_id: Optional[int]) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_word_state(self, *, vid: int, sid: int, flag: str, state: Any, jpdb_api_key: str) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def review_card(self, *, vid: int, sid: int, rating: str, jpdb_api_key: str, review_url: str) -> Dict[str, Any]:
        raise NotImplementedError


class JpdbHttpProvider(JpdbApiProvider):
    def post_tokens_batch(
        self,
        *,
        text_batch: List[str],
        token_fields: List[str],
        vocab_fields: List[str],
        api_url: str,
        headers: Dict[str, str],
        timeout_connect: float = 5.0,
        timeout_read: float = 30.0,
    ) -> Dict[str, Any]:
        import requests
        payload = {
            'text': text_batch,
            'position_length_encoding': 'utf16',
            'token_fields': token_fields,
            'vocabulary_fields': vocab_fields,
        }
        response = requests.post(api_url, headers=headers, json=payload, timeout=(timeout_connect, timeout_read))
        response.raise_for_status()
        return response.json()

    def mine_word(self, *, vid: int, sid: int, jpdb_api_key: str, mining_deck_id: Optional[int]) -> Dict[str, Any]:
        # Placeholder API call; real implementation would hit JPDB mining endpoint
        return {"success": True}

    def update_word_state(self, *, vid: int, sid: int, flag: str, state: Any, jpdb_api_key: str) -> Dict[str, Any]:
        # Placeholder API call; real implementation would hit JPDB state endpoint
        return {"success": True}

    def review_card(self, *, vid: int, sid: int, rating: str, jpdb_api_key: str, review_url: str) -> Dict[str, Any]:
        import requests
        headers = {
            'Authorization': f'Bearer {jpdb_api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
        payload = {'vid': vid, 'sid': sid, 'grade': 'okay' if rating == 'good' else rating}
        response = requests.post(review_url, headers=headers, json=payload)
        response.raise_for_status()
        return {"success": True}

