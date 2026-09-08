"""Tests for kanji domain routes."""
import pytest
from flask import Flask
from unittest.mock import Mock

from app.domains.kanji.routes import kanji_bp
from app.domains.kanji.service import KanjiService
from app.domains.kanji.schemas import KanjiSearchResponse, KanjiSearchResult, UpdateKanjiJlptResponse


@pytest.fixture
def app():
    """Create Flask app with kanji blueprint."""
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.extensions["container"] = Mock()
    app.register_blueprint(kanji_bp)
    return app


@pytest.fixture
def client(app, authenticated_client):
    """Create test client."""
    return authenticated_client(app)


@pytest.fixture
def mock_kanji_data():
    """Mock kanji data."""
    return {
        'kanjis': {
            '漢': {
                'meanings': ['kanji', 'character'],
                'jlpt': 2
            },
            '水': {
                'meanings': ['water'],
                'jlpt': 5
            }
        }
    }


def test_search_kanji_success(client, mock_kanji_data):
    """Test searching kanji successfully."""
    mock_service = Mock(spec=KanjiService)
    mock_service.search_kanji.return_value = KanjiSearchResponse(
        results=[KanjiSearchResult(kanji="漢", meanings=["kanji", "character"], jlpt=2)]
    )

    container = Mock()
    container.make_kanji_service.return_value = mock_service
    client.application.extensions["container"] = container

    response = client.post('/api/kanji/search', json={'query': '漢'})
    assert response.status_code == 200
    data = response.get_json()
    assert 'results' in data


def test_search_kanji_validation_error(client):
    """Test search kanji with invalid input."""
    response = client.post('/api/kanji/search', json={})
    assert response.status_code == 400


def test_update_kanji_is_disabled_without_calling_service(client):
    container = Mock()
    client.application.extensions["container"] = container
    response = client.post('/api/kanji/update', json={'kanji': '漢', 'jlpt_level': 2})
    assert response.status_code == 409
    assert response.json['code'] == 'DEPLOYMENT_MANAGED'
    container.make_kanji_service.assert_not_called()
