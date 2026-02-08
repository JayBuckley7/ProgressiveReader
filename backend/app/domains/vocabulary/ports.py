from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any, Tuple

from .schemas import DueCard, Deck, Vocabulary as VocabularySchema


class JpdbProvider(ABC):
    @abstractmethod
    def fetch_due_cards(
        self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]
    ) -> List[DueCard]:
        raise NotImplementedError

    @abstractmethod
    def fetch_user_decks(
        self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]
    ) -> List[Deck]:
        raise NotImplementedError


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
    def post_endpoint(
        self,
        endpoint: str,
        *,
        jpdb_api_key: str,
        payload: dict,
        timeout: Tuple[float, float] = (5.0, 30.0),
        retries: int = 3,
        user_agent: str = "ProgressiveReader/jpdb-proxy",
    ) -> Dict[str, Any]:
        """POST to an arbitrary JPDB API endpoint and return parsed JSON dict."""
        raise NotImplementedError

    @abstractmethod
    def mine_word(
        self,
        *,
        vid: int,
        sid: int,
        jpdb_api_key: str,
        mining_deck_id: Optional[int],
        forq: Optional[bool] = None,
        forq_deck_id: Optional[int] = None,
        sentence: Optional[str] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_word_state(
        self,
        *,
        vid: int,
        sid: int,
        flag: str,
        state: Any,
        jpdb_api_key: str,
        blacklist_deck_id: Optional[int] = None,
        never_forget_deck_id: Optional[int] = None,
        forq_deck_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def review_card(self, *, vid: int, sid: int, rating: str, jpdb_api_key: str, review_url: str) -> Dict[str, Any]:
        raise NotImplementedError


class VocabularyRepositoryPort(ABC):
    @abstractmethod
    def add_vocabulary_word(
        self,
        user_id: Optional[str],
        word: str,
        translation: str,
        language: str,
        book_id: Optional[str] = None,
        context: Optional[str] = None,
        difficulty: Optional[str] = None,
    ) -> VocabularySchema:
        raise NotImplementedError

    @abstractmethod
    def get_user_vocabulary(
        self,
        user_id: Optional[str],
        language: Optional[str] = None,
        mastered: Optional[bool] = None,
        book_id: Optional[str] = None,
    ) -> List[VocabularySchema]:
        raise NotImplementedError

    @abstractmethod
    def toggle_mastered(self, user_id: Optional[str], word_id: int, mastered: bool) -> Optional[VocabularySchema]:
        raise NotImplementedError

    @abstractmethod
    def delete_vocabulary_word(self, user_id: Optional[str], word_id: int) -> bool:
        raise NotImplementedError


__all__ = ["JpdbProvider", "JpdbApiProvider", "VocabularyRepositoryPort"]
