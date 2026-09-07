"""Tests for translation domain routes."""
import pytest
from flask import Flask
from unittest.mock import Mock, patch

from app.domains.translation.routes import translation_bp
from app.domains.translation.service import TranslationService
from app.domains.translation.ports import TranslationProvider


@pytest.fixture
def app():
    """Create Flask app with translation blueprint."""
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['OPENAI_API_KEY'] = 'test-key'
    # Container is required by the routes; tests can override per case.
    app.extensions["container"] = Mock()
    app.register_blueprint(translation_bp)
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def mock_provider():
    """Create mock translation provider."""
    provider = Mock(spec=TranslationProvider)
    provider.translate_chapter.return_value = "<p>Translated text</p>"
    provider.stream_translate_chapter.return_value = iter(["<p>", "Translated", " text</p>"])
    return provider


def test_translate_chapter_non_streaming(client, mock_provider):
    """Test chapter translation endpoint (non-streaming)."""
    container = Mock()
    container.make_translation_service.return_value = TranslationService(mock_provider)
    client.application.extensions["container"] = container

    response = client.post('/api/translate/chapter', json={
        'content': '<p>Test content</p>',
        'target_lang': 'English',
        'stream': False
    })
    assert response.status_code == 200
    data = response.get_json()
    assert 'translated_text' in data


def test_translate_chapter_accepts_targetLang_alias(client, mock_provider):
    """Generated TS types use targetLang; the API should accept it."""
    container = Mock()
    container.make_translation_service.return_value = TranslationService(mock_provider)
    client.application.extensions["container"] = container

    response = client.post('/api/translate/chapter', json={
        'content': '<p>Test content</p>',
        'targetLang': 'English',
        'useCefr': True,
        'cefrLevel': 'B2',
        'stream': False,
    })
    assert response.status_code == 200
    data = response.get_json()
    assert 'translated_text' in data


def test_translate_chapter_streaming(client, mock_provider):
    """Test chapter translation endpoint (streaming)."""
    container = Mock()
    container.make_translation_service.return_value = TranslationService(mock_provider)
    client.application.extensions["container"] = container

    response = client.post('/api/translate/chapter', json={
        'content': '<p>Test content</p>',
        'target_lang': 'English',
        'stream': True
    })
    assert response.status_code == 200
    assert response.content_type == 'text/event-stream'


def test_translate_chapter_validation_error(client):
    """Test chapter translation with invalid input."""
    response = client.post('/api/translate/chapter', json={
        # Missing required 'content' field
        'target_lang': 'English'
    })
    assert response.status_code == 400


def test_translate_chapter_api_key_not_configured(client):
    """Test chapter translation when API key is not configured."""
    container = Mock()
    container.openai_key_resolver.resolve.return_value = None
    client.application.extensions["container"] = container

    response = client.post('/api/translate/chapter', json={
        'content': '<p>Test</p>',
        'target_lang': 'English'
    })
    assert response.status_code == 400
    data = response.get_json()
    assert 'error' in data


def test_translate_segments_matches_camel_case_contract_and_batches_once(client, mock_provider):
    mock_provider.translate_chapter.side_effect = lambda **kwargs: (
        kwargs["content"].replace("<p>one</p>", "<p>ONE</p>").replace("<em>two</em>", "<em>TWO</em>")
    )
    container = Mock()
    container.openai_key_resolver.resolve.return_value = "resolved-key"
    container.make_translation_service.return_value = TranslationService(mock_provider)
    client.application.extensions["container"] = container

    response = client.post('/api/translate/segments', json={
        "segments": [
            {"id": "s-1", "html": "<p>one</p>", "sourceHash": "hash-1"},
            {"id": "s-2", "html": "<em>two</em>"},
        ],
        "targetLanguage": "English",
        "model": "gpt-4o-mini",
        "useCefr": True,
        "cefrLevel": "B2",
        "promptVersion": "segments-v1",
    })

    assert response.status_code == 200
    assert response.get_json() == {
        "segments": [
            {
                "id": "s-1",
                "translatedHtml": "<p>ONE</p>",
                "sourceHash": "hash-1",
                "modelUsed": "gpt-4o-mini",
            },
            {
                "id": "s-2",
                "translatedHtml": "<em>TWO</em>",
                "modelUsed": "gpt-4o-mini",
            },
        ],
        "modelUsed": "gpt-4o-mini",
    }
    mock_provider.translate_chapter.assert_called_once()
    call = mock_provider.translate_chapter.call_args.kwargs
    assert call["target_lang"] == "English"
    assert call["use_cefr"] is True
    assert call["cefr_level"] == "B2"


def test_translate_segments_accepts_snake_case_and_target_lang_alias(client, mock_provider):
    mock_provider.translate_chapter.side_effect = lambda **kwargs: kwargs["content"]
    container = Mock()
    container.openai_key_resolver.resolve.return_value = "resolved-key"
    container.make_translation_service.return_value = TranslationService(mock_provider)
    client.application.extensions["container"] = container

    response = client.post('/api/translate/segments', json={
        "segments": [{"id": "s-1", "html": "<p>one</p>", "source_hash": "hash-1"}],
        "target_lang": "French",
        "use_cefr": False,
        "prompt_version": "segments-v1",
    })

    assert response.status_code == 200
    assert response.get_json()["segments"][0]["sourceHash"] == "hash-1"
    assert mock_provider.translate_chapter.call_args.kwargs["target_lang"] == "French"


def test_translate_segments_streaming_sends_typed_segment_events(client, mock_provider):
    mock_provider.stream_translate_chapter.side_effect = lambda **kwargs: iter([
        kwargs["content"].replace("<p>one</p>", "<p>ONE</p>"),
    ])
    container = Mock()
    container.openai_key_resolver.resolve.return_value = "resolved-key"
    container.make_translation_service.return_value = TranslationService(mock_provider)
    client.application.extensions["container"] = container

    response = client.post('/api/translate/segments', json={
        "segments": [{"id": "s-1", "html": "<p>one</p>", "sourceHash": "hash-1"}],
        "targetLanguage": "English",
        "stream": True,
    })

    assert response.status_code == 200
    assert response.content_type == "text/event-stream"
    body = response.get_data(as_text=True)
    assert '"segmentCount": 1' in body
    assert '"translatedHtml": "<p>ONE</p>"' in body
    assert '"sourceHash": "hash-1"' in body
    assert "data: [DONE]" in body
    mock_provider.stream_translate_chapter.assert_called_once()


def test_translate_segments_returns_paid_subset_when_repair_cannot_restore_all_boundaries(client, mock_provider):
    mock_provider.translate_chapter.side_effect = [
        '<pr-translation-segment data-pr-index="0"><p>ONE</p></pr-translation-segment>',
        "<p>translated without boundaries</p>",
    ]
    container = Mock()
    container.openai_key_resolver.resolve.return_value = "resolved-key"
    container.make_translation_service.return_value = TranslationService(mock_provider)
    client.application.extensions["container"] = container

    response = client.post('/api/translate/segments', json={
        "segments": [
            {"id": "s-1", "html": "<p>one</p>", "sourceHash": "hash-1"},
            {"id": "s-2", "html": "<p>two</p>", "sourceHash": "hash-2"},
        ],
        "targetLanguage": "English",
    })

    assert response.status_code == 200
    assert response.get_json()["segments"] == [{
        "id": "s-1",
        "translatedHtml": "<p>ONE</p>",
        "sourceHash": "hash-1",
        "modelUsed": "gpt-5.6-luna",
    }]
    assert mock_provider.translate_chapter.call_count == 2
    assert "<p>one</p>" not in mock_provider.translate_chapter.call_args_list[1].kwargs["content"]
    assert "<p>two</p>" in mock_provider.translate_chapter.call_args_list[1].kwargs["content"]


def test_translate_segments_stream_marks_an_exhausted_partial_batch_incomplete(client, mock_provider):
    mock_provider.stream_translate_chapter.side_effect = [
        iter(['<pr-translation-segment data-pr-index="0"><p>ONE</p></pr-translation-segment>']),
        iter(["<p>translated without boundaries</p>"]),
    ]
    container = Mock()
    container.openai_key_resolver.resolve.return_value = "resolved-key"
    container.make_translation_service.return_value = TranslationService(mock_provider)
    client.application.extensions["container"] = container

    response = client.post('/api/translate/segments', json={
        "segments": [
            {"id": "s-1", "html": "<p>one</p>"},
            {"id": "s-2", "html": "<p>two</p>"},
        ],
        "targetLanguage": "English",
        "stream": True,
    })

    assert response.status_code == 200
    body = response.get_data(as_text=True)
    assert '"id": "s-1"' in body
    assert '"complete": false' in body
    assert "data: [DONE]" in body
    assert mock_provider.stream_translate_chapter.call_count == 2


@pytest.mark.parametrize(
    "segments",
    [[], [{"id": "duplicate", "html": "one"}, {"id": "duplicate", "html": "two"}]],
)
def test_translate_segments_rejects_empty_or_duplicate_segments(client, segments):
    response = client.post('/api/translate/segments', json={
        "segments": segments,
        "targetLanguage": "English",
    })

    assert response.status_code == 400
