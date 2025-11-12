"""Tests for kanji domain routes."""
import pytest
from flask import Flask
from unittest.mock import Mock, patch, mock_open
import json

from app.domains.kanji.routes import kanji_bp
from app.domains.kanji.service import KanjiService
from app.domains.kanji.repository import KanjiRepository


@pytest.fixture
def app():
    """Create Flask app with kanji blueprint."""
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(kanji_bp)
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


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
    mock_repo = Mock(spec=KanjiRepository)
    mock_repo.search_kanji.return_value = [
        {'kanji': '漢', 'meanings': ['kanji', 'character'], 'jlpt': 2}
    ]
    
    mock_service = Mock(spec=KanjiService)
    mock_service.search_kanji.return_value = type('obj', (object,), {
        'dict': lambda: {
            'results': [
                {'kanji': '漢', 'meanings': ['kanji', 'character'], 'jlpt': 2}
            ]
        }
    })()
    
    with patch('app.domains.kanji.routes.KanjiRepository', return_value=mock_repo):
        with patch('app.domains.kanji.routes.KanjiService', return_value=mock_service):
            response = client.post('/api/kanji/search', json={'query': '漢'})
            assert response.status_code == 200
            data = response.get_json()
            assert 'results' in data


def test_search_kanji_validation_error(client):
    """Test search kanji with invalid input."""
    response = client.post('/api/kanji/search', json={})
    assert response.status_code == 400


def test_update_kanji_jlpt_success(client):
    """Test updating kanji JLPT level successfully."""
    mock_repo = Mock(spec=KanjiRepository)
    mock_repo.update_jlpt_level.return_value = (2, 1)  # (old_jlpt, new_jlpt)
    
    mock_service = Mock(spec=KanjiService)
    mock_service.update_jlpt_level.return_value = type('obj', (object,), {
        'dict': lambda: {
            'success': True,
            'kanji': '漢',
            'old_jlpt': 2,
            'new_jlpt': 1
        }
    })()
    
    with patch('app.domains.kanji.routes.KanjiRepository', return_value=mock_repo):
        with patch('app.domains.kanji.routes.KanjiService', return_value=mock_service):
            response = client.post('/api/kanji/update', json={
                'kanji': '漢',
                'jlpt_level': 1
            })
            assert response.status_code == 200
            data = response.get_json()
            assert data['success'] is True


def test_update_kanji_jlpt_validation_error(client):
    """Test update kanji with invalid input."""
    # Invalid kanji (multiple characters)
    response = client.post('/api/kanji/update', json={
        'kanji': '漢字',  # Should be single character
        'jlpt_level': 1
    })
    assert response.status_code == 400
    
    # Invalid JLPT level
    response = client.post('/api/kanji/update', json={
        'kanji': '漢',
        'jlpt_level': 6  # Should be 1-5
    })
    assert response.status_code == 400


def test_get_kanji_info_success(client):
    """Test getting kanji info successfully."""
    mock_repo = Mock(spec=KanjiRepository)
    mock_repo.get_kanji_info.return_value = {
        'kanji': '漢',
        'meanings': ['kanji', 'character'],
        'jlpt': 2
    }
    
    mock_service = Mock(spec=KanjiService)
    mock_service.get_kanji_info.return_value = {
        'kanji': '漢',
        'meanings': ['kanji', 'character'],
        'jlpt': 2
    }
    
    with patch('app.domains.kanji.routes.KanjiRepository', return_value=mock_repo):
        with patch('app.domains.kanji.routes.KanjiService', return_value=mock_service):
            response = client.get('/api/kanji/info/漢')
            assert response.status_code == 200
            data = response.get_json()
            assert data['kanji'] == '漢'


def test_get_kanji_info_invalid_char(client):
    """Test getting kanji info with invalid character."""
    response = client.get('/api/kanji/info/漢字')  # Multiple characters
    assert response.status_code == 400



