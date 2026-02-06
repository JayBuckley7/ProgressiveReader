from __future__ import annotations

import pytest

from app import create_app


@pytest.fixture()
def app():
    app = create_app()
    app.config.update(TESTING=True)
    return app


@pytest.fixture()
def client(app):
    return app.test_client()


def test_validate_examples_invalid_payload(client):
    res = client.post("/api/grammar/validate-examples", json=None)
    assert res.status_code == 400


def test_validate_examples_missing_fields(client):
    res = client.post("/api/grammar/validate-examples", json={})
    assert res.status_code == 400


def test_validate_examples_caps_candidates(client):
    payload = {
        "grammar": {"id": "n5:ている", "title": "ている", "meaning": "ongoing state", "level": "n5"},
        "apiKey": "test-key",
        "candidates": [{"id": f"c{i}", "sentence": "これはテストです"} for i in range(0, 50)],
    }
    res = client.post("/api/grammar/validate-examples", json=payload)
    assert res.status_code == 400


def test_validate_examples_success(client, monkeypatch):
    from app.domains.grammar.integrations import OpenAIProvider
    from app.domains.grammar.schemas import ValidateExamplesResponse, GrammarValidateMatch, Span

    def _mock_validate(self, req):
        return ValidateExamplesResponse(
            matches=[
                GrammarValidateMatch(
                    candidateId="c1",
                    isMatch=True,
                    confidence=0.9,
                    matchSpan=Span(start=3, end=6, text="ている"),
                    explanation="Ongoing action/state.",
                ),
                GrammarValidateMatch(candidateId="c0", isMatch=False, confidence=0.1, matchSpan=None, explanation=None),
            ]
        )

    monkeypatch.setattr(OpenAIProvider, "validate_examples", _mock_validate)

    payload = {
        "grammar": {"id": "n5:ている", "title": "ている", "meaning": "ongoing state", "level": "n5"},
        "apiKey": "test-key",
        "model": "gpt-4o-mini",
        "maxResults": 3,
        "candidates": [
            {"id": "c0", "sentence": "今日は雨だ。"},
            {"id": "c1", "sentence": "今、食べている。", "hintSpan": {"start": 3, "end": 6}},
        ],
    }
    res = client.post("/api/grammar/validate-examples", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert "matches" in data
    assert any(m.get("candidateId") == "c1" and m.get("isMatch") is True for m in data["matches"])

