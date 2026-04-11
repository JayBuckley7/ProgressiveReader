from __future__ import annotations

from typing import Any

import pytest

from app.domains.vocabulary.adapters.jpdb_http import JpdbHttpProvider


class RecordingJpdbHttpProvider(JpdbHttpProvider):
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any], int]] = []

    def post_endpoint(
        self,
        endpoint: str,
        *,
        jpdb_api_key: str,
        payload: dict,
        timeout=(5.0, 30.0),
        retries: int = 3,
        user_agent: str = "ProgressiveReader/jpdb-proxy",
    ) -> dict[str, Any]:
        self.calls.append((endpoint, payload, retries))
        return {"ok": True}


def test_add_vocabulary_uses_current_deck_endpoint_payload() -> None:
    provider = RecordingJpdbHttpProvider()

    provider._deck_add_vocabulary(deck_id=42, vid=100, sid=200, jpdb_api_key="token")

    assert provider.calls == [
        (
            "deck/add-vocabulary",
            {
                "id": 42,
                "vocabulary": [[100, 200]],
                "ignore_unknown": True,
                "replace_existing_occurrences": False,
            },
            3,
        )
    ]


def test_set_card_sentence_uses_current_endpoint_without_deck_prefix() -> None:
    provider = RecordingJpdbHttpProvider()

    provider._set_card_sentence(vid=100, sid=200, jpdb_api_key="token", sentence="example")

    assert provider.calls == [
        (
            "set-card-sentence",
            {"vid": 100, "sid": 200, "sentence": "example"},
            1,
        )
    ]


def test_mine_word_does_not_fail_if_sentence_attachment_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    provider = RecordingJpdbHttpProvider()

    def fail_sentence(**_: Any) -> dict[str, Any]:
        raise ValueError("this api endpoint does not exist")

    monkeypatch.setattr(provider, "_set_card_sentence", fail_sentence)

    result = provider.mine_word(
        vid=100,
        sid=200,
        jpdb_api_key="token",
        mining_deck_id=42,
        sentence="example",
    )

    assert result["success"] is True
    assert result["sentence_warning"] == "this api endpoint does not exist"
    assert provider.calls[0][0] == "deck/add-vocabulary"
