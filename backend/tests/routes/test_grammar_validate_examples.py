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
    from app.domains.grammar.adapters.openai import OpenAIProvider
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


def test_teach_examples_success(client, monkeypatch):
    import app.domains.grammar.adapters.openai as grammar_openai_adapter

    class _FakeCompletion:
        def __init__(self, content: str):
            class _Msg:
                def __init__(self, c: str):
                    self.content = c

            class _Choice:
                def __init__(self, c: str):
                    self.message = _Msg(c)

            self.choices = [_Choice(content)]

    class _FakeOpenAI:
        def __init__(self, *args, **kwargs):
            class _Chat:
                class _Completions:
                    def create(self, *a, **k):
                        return _FakeCompletion(
                            "{\"teachings\":[{\"exampleId\":\"ex1\",\"translation\":\"Maybe because it's a girls' dorm...\",\"breakdown\":\"女子寮 (girls' dorm) だから (because) か (maybe)\",\"contrast\":{\"alternative\":\"女子寮なので、見事に女の人しかいない。\",\"note\":\"Softer / more explanatory than だから.\"}}]}"
                        )

                def __init__(self):
                    self.completions = self._Completions()

            self.chat = _Chat()

    monkeypatch.setattr(grammar_openai_adapter, "OpenAI", _FakeOpenAI)

    payload = {
        "grammar": {"id": "n5:だから", "title": "だから", "meaning": "because", "level": "n5"},
        "apiKey": "test-key",
        "model": "gpt-4o-mini",
        "examples": [
            {
                "exampleId": "ex1",
                "sentence": "女子寮だからか、見事に女の人しかいない。",
                "matchSpan": {"start": 3, "end": 6, "text": "だから"},
            }
        ],
    }
    res = client.post("/api/grammar/teach-examples", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert "teachings" in data
    assert data["teachings"][0]["exampleId"] == "ex1"
