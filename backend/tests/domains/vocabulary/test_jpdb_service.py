from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.domains.vocabulary.ports import JpdbProvider, JpdbApiProvider
from app.domains.vocabulary.schemas import (
    DueCard,
    Deck,
    GetJpdbDataRequest,
    MineWordRequest,
    UpdateWordStateRequest,
    ReviewCardRequest,
)
from app.domains.vocabulary.config import JpdbConfig
from app.domains.vocabulary.service import VocabularyService


class _MockModuleProvider(JpdbProvider):
    def fetch_due_cards(self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]) -> List[DueCard]:
        return []

    def fetch_user_decks(self, *, username: Optional[str], password: Optional[str], cookie_string: Optional[str]) -> List[Deck]:
        return []


class _MockApiProvider(JpdbApiProvider):
    def __init__(self, jpdb_data: Dict[str, Any] | None = None) -> None:
        self._jpdb_data = jpdb_data or {
            'vocabulary': [
                # order must match VOCAB_FIELDS indices in tests
                [1, 1, 0, '本', 'ほん', 1000, 'noun', [['book']], ['noun'], ['known'], []],
            ],
            'tokens': [
                [
                    # order must match TOKEN_FIELDS indices in tests
                    [0, 0, 2, [['本', 'ほん']]],
                ]
            ],
        }

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
        return self._jpdb_data

    def post_endpoint(
        self,
        endpoint: str,
        *,
        jpdb_api_key: str,
        payload: dict,
        timeout=(5.0, 30.0),
        retries: int = 3,
        user_agent: str = "ProgressiveReader/jpdb-proxy",
    ) -> Dict[str, Any]:
        return {"endpoint": endpoint, "success": True}

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
        return {"success": True}

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
        return {"success": True}

    def review_card(self, *, vid: int, sid: int, rating: str, jpdb_api_key: str, review_url: str) -> Dict[str, Any]:
        return {"success": True}


def _jpdb_config() -> JpdbConfig:
    return JpdbConfig(
        max_bytes_per_api_batch=1024,
        max_segments_per_api_batch=10,
        token_fields=["vocabulary_index", "position", "length", "furigana"],
        vocab_fields=[
            "vid",
            "sid",
            "rid",
            "spelling",
            "reading",
            "frequency_rank",
            "part_of_speech",
            "meanings_chunks",
            "meanings_part_of_speech",
            "card_state",
            "pitch_accent",
        ],
        api_url="http://example.test",
        review_url="http://example.test/review",
    )


def test_get_jpdb_data_empty_returns_empty():
    svc = VocabularyService(_MockModuleProvider(), _jpdb_config(), _MockApiProvider())
    req = GetJpdbDataRequest(text_segments=["   ", "\n\n"], jpdb_api_key="x")
    out = svc.get_jpdb_data(request=req)
    assert out == []


def test_get_jpdb_data_basic_maps_token_and_vocab():
    svc = VocabularyService(_MockModuleProvider(), _jpdb_config(), _MockApiProvider())
    req = GetJpdbDataRequest(text_segments=["本です"], jpdb_api_key="x")
    out = svc.get_jpdb_data(request=req)
    assert len(out) == 1
    t0 = out[0]
    assert t0.start == 0 and t0.length == 2 and t0.end == 2
    assert t0.card.get('spelling') == '本'
    assert t0.card.get('reading') == 'ほん'
    assert any(r.text == 'ほん' for r in t0.rubies)


def test_mine_update_review_success():
    svc = VocabularyService(_MockModuleProvider(), _jpdb_config(), _MockApiProvider())
    assert svc.mine_word(request=MineWordRequest(vid=1, sid=2, jpdb_api_key='x', mining_deck_id=None)) == {"success": True}
    assert svc.update_word_state(request=UpdateWordStateRequest(vid=1, sid=2, flag='blacklist', state=True, jpdb_api_key='x')) == {"success": True}
    assert svc.review_card(request=ReviewCardRequest(vid=1, sid=2, rating='good', jpdb_api_key='x')) == {"success": True}


def test_get_jpdb_data_preserves_whitespace_for_offsets():
    jpdb_data = {
        'vocabulary': [
            [1, 1, 0, 'C', 'c', 1000, 'noun', [['c']], ['noun'], ['known'], []],
        ],
        # Two segments: first has no tokens, second has one token at position 0
        'tokens': [
            [],
            [[0, 0, 1, []]],
        ],
    }

    svc = VocabularyService(_MockModuleProvider(), _jpdb_config(), _MockApiProvider(jpdb_data))
    req = GetJpdbDataRequest(text_segments=["A   B", "C"], jpdb_api_key="x")
    out = svc.get_jpdb_data(request=req)
    assert len(out) == 1
    assert out[0].start == 5  # len("A   B") in UTF-16 code units


def test_get_jpdb_data_uses_utf16_offsets_for_symbols():
    jpdb_data = {
        'vocabulary': [
            [1, 1, 0, 'C', 'c', 1000, 'noun', [['c']], ['noun'], ['known'], []],
        ],
        'tokens': [
            [],
            [[0, 0, 1, []]],
        ],
    }

    svc = VocabularyService(_MockModuleProvider(), _jpdb_config(), _MockApiProvider(jpdb_data))
    req = GetJpdbDataRequest(text_segments=["A😀B", "C"], jpdb_api_key="x")
    out = svc.get_jpdb_data(request=req)
    assert len(out) == 1
    assert out[0].start == 4  # "😀" is two UTF-16 code units
