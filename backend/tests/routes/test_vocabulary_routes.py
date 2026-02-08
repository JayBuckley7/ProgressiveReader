from __future__ import annotations

import types
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


def test_get_jpdb_data_invalid_payload(client):
    resp = client.post('/api/get_jpdb_data', json={})
    assert resp.status_code == 400


def test_update_jpdb_word_state_predicts_state(client, monkeypatch):
    # Patch provider's update_word_state to avoid network
    from app.domains.vocabulary.adapters.jpdb_http import JpdbHttpProvider

    def _mock_update(self, *, vid, sid, flag, state, jpdb_api_key, **kwargs):
        return {"success": True}

    monkeypatch.setattr(JpdbHttpProvider, 'update_word_state', _mock_update)

    resp = client.post('/api/update_jpdb_word_state', json={
        'vid': 1,
        'sid': 2,
        'flag': 'blacklist',
        'state': True,
        'jpdb_api_key': 'x'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['newState'] == ['known']


def test_review_jpdb_card_success(client, monkeypatch):
    # Patch provider's review_card to avoid network
    from app.domains.vocabulary.adapters.jpdb_http import JpdbHttpProvider

    def _mock_review(self, *, vid, sid, rating, jpdb_api_key, review_url):
        return {"success": True}

    monkeypatch.setattr(JpdbHttpProvider, 'review_card', _mock_review)

    resp = client.post('/api/review_jpdb_card', json={
        'vid': 1,
        'sid': 2,
        'rating': 'good',
        'jpdb_api_key': 'x'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['newState'] == ['known']
