import json
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from flask import Flask
from pydantic import ValidationError
from app.domains.drive.routes import drive_bp
from app.infrastructure.drive_ocr import DriveOcrStorage
from app.core.errors import AppError

PAGE = {'version': 1, 'engine': 'legacy', 'regions': [{'text': '女神', 'x': .1, 'y': .2, 'width': .1, 'height': .4}]}
HASH = 'a' * 64

def response(body):
    r = Mock(ok=True, status_code=200)
    r.json.return_value = body
    r.iter_content.return_value = [json.dumps(body).encode()]
    r.__enter__ = Mock(return_value=r)
    r.__exit__ = Mock(return_value=False)
    return r

def test_route_uses_real_auth_and_rejects_anonymous(authenticated_client):
    app = Flask(__name__); app.register_blueprint(drive_bp)
    storage = Mock(); storage.page.return_value = PAGE
    app.extensions['container'] = SimpleNamespace(drive_ocr=storage)
    client = authenticated_client(app)
    assert client.get('/drive/ocr/pages/' + HASH, headers={'Authorization': ''}).status_code == 401
    storage.page.assert_not_called()
    assert client.put('/drive/ocr/pages/' + HASH, json=PAGE, headers={'X-OCR-Account': 'test-user'}).status_code == 200
    storage.page.assert_called_once_with('test-user', HASH, PAGE)
    assert client.put('/drive/ocr/pages/' + HASH, json=PAGE, headers={'X-OCR-Account': 'other-user'}).status_code == 409
    assert storage.page.call_count == 1

def test_save_then_retry_reads_existing_sidecar_without_overwriting(monkeypatch):
    storage = DriveOcrStorage(SimpleNamespace(get_access_token=lambda owner: 'token'))
    listing = Mock(side_effect=[[], [{'id': 'folder'}], [{'id': 'page', 'createdTime': '1'}]])
    monkeypatch.setattr(storage, '_list', listing)
    post = Mock(return_value=response({'id': 'new'}))
    monkeypatch.setattr('app.infrastructure.drive_ocr.requests.post', post)
    monkeypatch.setattr('app.infrastructure.drive_ocr.requests.get', lambda *a, **k: response(PAGE))
    assert storage.page('alice', HASH, PAGE) == PAGE
    assert storage.page('alice', HASH, PAGE) == PAGE
    assert post.call_count == 1
    assert 'multipart/related' in post.call_args.kwargs['headers']['Content-Type']
    assert listing.call_args_list[0].args[1]['pr_image'] == HASH


def test_route_supports_serving_container_without_switching_repositories(authenticated_client, monkeypatch):
    app = Flask(__name__); app.register_blueprint(drive_bp)
    provider = object()
    app.extensions['container'] = SimpleNamespace(drive_service=SimpleNamespace(integration=SimpleNamespace(provider=provider)))
    storage = Mock(); storage.page.return_value = PAGE
    factory = Mock(return_value=storage)
    monkeypatch.setattr('app.infrastructure.drive_ocr.DriveOcrStorage', factory)
    client = authenticated_client(app)
    for _ in range(2):
        assert client.get('/drive/ocr/pages/' + HASH, headers={'X-OCR-Account': 'test-user'}).status_code == 200
    factory.assert_called_once_with(provider)
    assert storage.page.call_count == 2

def test_accounts_are_isolated_and_missing_is_distinct(monkeypatch):
    owners = []
    storage = DriveOcrStorage(SimpleNamespace(get_access_token=lambda owner: owners.append(owner) or 'token'))
    listing = Mock(return_value=[]); monkeypatch.setattr(storage, '_list', listing)
    assert storage.page('alice', HASH) is None
    assert storage.page('bob', HASH) is None
    assert owners == ['alice', 'bob']
    assert listing.call_args_list[0].args[1]['pr_owner'] != listing.call_args_list[1].args[1]['pr_owner']
    with pytest.raises(AppError): storage.page('', HASH)

def test_corrupt_cloud_does_not_trigger_write(monkeypatch):
    storage = DriveOcrStorage(SimpleNamespace(get_access_token=lambda owner: 'token'))
    monkeypatch.setattr(storage, '_list', lambda *a: [{'id': 'bad'}])
    monkeypatch.setattr('app.infrastructure.drive_ocr.requests.get', lambda *a, **k: response({'broken': True}))
    post = Mock(); monkeypatch.setattr('app.infrastructure.drive_ocr.requests.post', post)
    with pytest.raises(ValidationError): storage.page('alice', HASH, PAGE)
    post.assert_not_called()

@pytest.mark.parametrize('payload', [dict(PAGE, owner='bob'), {'regions': [{'text': 'x', 'x': float('nan'), 'y': 0, 'width': 1, 'height': 1}]}])
def test_payload_cannot_supply_identity_or_invalid_geometry(payload):
    provider = Mock(); storage = DriveOcrStorage(provider)
    with pytest.raises(ValidationError): storage.page('alice', HASH, payload)
    provider.get_access_token.assert_not_called()

def test_transport_timeout_is_recoverable_without_retry(monkeypatch):
    from requests import Timeout
    storage = DriveOcrStorage(SimpleNamespace(get_access_token=lambda owner: 'token'))
    listing = Mock(side_effect=Timeout('connection timed out'))
    monkeypatch.setattr(storage, '_list', listing)
    with pytest.raises(AppError) as failure:
        storage.page('alice', HASH, PAGE)
    assert failure.value.code == 'OCR_SYNC_UNAVAILABLE'
    assert failure.value.status == 503
    listing.assert_called_once()


def test_prefers_android_variant_and_keeps_weaker_variant(monkeypatch):
    storage = DriveOcrStorage(SimpleNamespace(get_access_token=lambda owner: 'token'))
    items = [
        {'id': 'web', 'createdTime': '1', 'appProperties': {'pr_engine': 'tesseract-auto'}},
        {'id': 'android', 'createdTime': '2', 'appProperties': {'pr_engine': 'mlkit-japanese-v2'}},
    ]
    monkeypatch.setattr(storage, '_list', lambda *a: items)
    get = Mock(return_value=response(dict(PAGE, engine='mlkit-japanese-v2')))
    monkeypatch.setattr('app.infrastructure.drive_ocr.requests.get', get)
    assert storage.page('alice', HASH)['engine'] == 'mlkit-japanese-v2'
    assert get.call_args.args[0].endswith('/android')
