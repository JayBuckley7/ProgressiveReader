"""Tests for vocabulary domain routes."""
import pytest
from flask import Flask
from unittest.mock import Mock

from app.domains.vocabulary.routes import vocabulary_bp
from app.domains.vocabulary.service import VocabularyService
from app.domains.vocabulary.schemas import DueCard, Deck


@pytest.fixture
def app():
    """Create Flask app with vocabulary blueprint."""
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['MAX_BYTES_PER_API_BATCH'] = 10000
    app.config['MAX_SEGMENTS_PER_API_BATCH'] = 50
    app.config['JPDB_TOKEN_FIELDS'] = ['position', 'length', 'vocabulary_index', 'furigana']
    app.config['JPDB_VOCAB_FIELDS'] = ['vid', 'sid', 'rid', 'spelling', 'reading']
    app.config['JPDB_API_URL'] = 'https://api.jpdb.io/v1/parse'
    app.extensions["container"] = Mock()
    app.register_blueprint(vocabulary_bp)
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def mock_vocabulary_service():
    """Create mock vocabulary service."""
    service = Mock(spec=VocabularyService)
    service.get_due_cards_with_auth.return_value = [
        DueCard(id='1', term='誰', meaning='who'),
        DueCard(id='2', term='水', meaning='water'),
    ]
    service.list_user_decks_with_auth.return_value = [
        Deck(id='1', name='My Deck', words=100),
        Deck(id='2', name='Another Deck', words=50),
    ]
    return service


def test_due_cards_success(client, mock_vocabulary_service):
    """Test fetching due cards successfully."""
    container = Mock()
    container.vocabulary_service = mock_vocabulary_service
    client.application.extensions["container"] = container

    response = client.post('/api/due_cards', json={
        'username': 'test',
        'password': 'test'
    })
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)
    assert len(data) == 2


def test_due_cards_auth_required(client):
    """Test that due cards requires authentication."""
    response = client.post('/api/due_cards', json={})
    assert response.status_code == 401


def test_list_user_decks_success(client, mock_vocabulary_service):
    """Test fetching user decks successfully."""
    container = Mock()
    container.vocabulary_service = mock_vocabulary_service
    client.application.extensions["container"] = container

    response = client.post('/api/list-user-decks', json={
        'username': 'test',
        'password': 'test'
    })
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)
    assert len(data) == 2


def test_get_jpdb_data_validation_error(client):
    """Test JPDB data endpoint with invalid input."""
    response = client.post('/api/get_jpdb_data', json={
        # Missing required fields
        'text_segments': []
    })
    assert response.status_code == 400


def test_mine_jpdb_word_success(client):
    """Test mining JPDB word successfully."""
    mock_service = Mock()
    mock_service.mine_word.return_value = {'success': True}
    container = Mock()
    container.vocabulary_service = mock_service
    client.application.extensions["container"] = container

    response = client.post('/api/mine_jpdb_word', json={
        'vid': 1,
        'sid': 1,
        'jpdb_api_key': 'test-key'
    })
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True


def test_update_jpdb_word_state_validation_error(client):
    """Test update word state with invalid input."""
    response = client.post('/api/update_jpdb_word_state', json={
        # Missing required fields
        'vid': 1
    })
    assert response.status_code == 400

