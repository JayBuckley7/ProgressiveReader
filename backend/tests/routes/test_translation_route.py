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


def test_translate_chapter_invalid_payload(client):
    res = client.post('/api/translate/chapter', json=None)
    assert res.status_code == 400


def test_translate_chapter_missing_content(client):
    res = client.post('/api/translate/chapter', json={})
    assert res.status_code == 400


def test_translate_chapter_non_stream_success(client, monkeypatch):
    from app.domains.translation.adapters.openai import OpenAIProvider

    def _mock_translate(self, *, content, target_lang, use_cefr=False, cefr_level=None, model=None):
        return f"<div>MOCK-{target_lang}-{len(content)}</div>"

    monkeypatch.setattr(OpenAIProvider, 'translate_chapter', _mock_translate)

    payload = {
        'content': '<p>hello</p>',
        'target_lang': 'English',
        'stream': False,
    }
    res = client.post('/api/translate/chapter', json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert 'translated_text' in data
    assert data['translated_text'].startswith('<div>MOCK-English-')


