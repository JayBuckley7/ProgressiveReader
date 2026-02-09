from __future__ import annotations

from typing import Any

from app.domains.mix.prompts import build_refine_swaps_messages
from app.domains.mix.schemas import MixRefineCandidate, MixRefineRequest
from app.domains.mix.service import MixService


class _StubProvider:
    def __init__(self, data: Any) -> None:
        self._data = data
        self.last_messages: list[dict[str, str]] | None = None

    def chat_json(self, *, model: str, messages: list[dict[str, str]], temperature: float = 0.0) -> Any:
        self.last_messages = messages
        return self._data


def test_build_refine_swaps_messages_shape() -> None:
    messages = build_refine_swaps_messages(
        text_sample="A short context.",
        tasks=[{"glossKey": "apple", "examples": ["I ate an apple."], "candidates": [{"id": "1/2", "spelling": "りんご"}]}],
    )

    assert isinstance(messages, list)
    assert [m.get("role") for m in messages] == ["system", "user"]
    assert "STRICT JSON" in (messages[0].get("content") or "")
    assert "Context (excerpt)" in (messages[1].get("content") or "")


def test_mix_service_rejects_non_string_choice_values() -> None:
    # Strict validation should treat non-string ids as invalid (no coercion).
    svc = MixService(_StubProvider({"choices": {"apple": 123}}))
    req = MixRefineRequest(
        text_sample="I ate an apple.",
        ambiguous_keys=["apple"],
        candidates_by_key={"apple": [MixRefineCandidate(id="1/2", spelling="りんご")]},
        model="gpt-4o-mini",
    )

    res = svc.refine_swaps(req)
    assert res.choices == {"apple": None}


def test_mix_service_allows_only_candidate_ids() -> None:
    # Provider returns an id not in the candidate set -> should be rejected.
    svc = MixService(_StubProvider({"choices": {"apple": "999/999"}}))
    req = MixRefineRequest(
        text_sample="I ate an apple.",
        ambiguous_keys=["apple"],
        candidates_by_key={"apple": [MixRefineCandidate(id="1/2", spelling="りんご")]},
    )

    res = svc.refine_swaps(req)
    assert res.choices == {"apple": None}


def test_mix_service_accepts_valid_choice() -> None:
    svc = MixService(_StubProvider({"choices": {"apple": "1/2"}}))
    req = MixRefineRequest(
        text_sample="I ate an apple.",
        ambiguous_keys=["apple"],
        candidates_by_key={"apple": [MixRefineCandidate(id="1/2", spelling="りんご")]},
    )

    res = svc.refine_swaps(req)
    assert res.choices == {"apple": "1/2"}

