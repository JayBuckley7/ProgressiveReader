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
