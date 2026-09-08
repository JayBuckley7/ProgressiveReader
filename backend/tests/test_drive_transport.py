from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from app.core.errors import AppError
from app.infrastructure.drive_records import DriveOperationStorage
from app.core.record_operations import RecordOperation


def response(body, status=200):
    result = Mock()
    result.ok = status < 400
    result.status_code = status
    result.json.return_value = body
    result.__enter__ = Mock(return_value=result)
    result.__exit__ = Mock(return_value=False)
    return result


def test_pagination_is_complete_and_scoped_to_identity(monkeypatch):
    calls = []
    def get(url, **kwargs):
        calls.append(kwargs)
        return response({'files': [], 'nextPageToken': 'second'} if len(calls) == 1 else {'files': []})
    monkeypatch.setattr('app.infrastructure.drive_records.requests.get', get)
    storage = DriveOperationStorage(SimpleNamespace(get_access_token=lambda owner: 'synthetic'))
    assert storage.read('alice', 'vocabulary') == []
    assert len(calls) == 2 and calls[1]['params']['pageToken'] == 'second'
    assert 'pr_owner' in calls[0]['params']['q'] and "'me' in owners" in calls[0]['params']['q']
    assert calls[0]['timeout'] == (5, 30)


def test_revoked_credentials_never_become_empty_records(monkeypatch):
    monkeypatch.setattr('app.infrastructure.drive_records.requests.get', lambda *a, **k: response({}, 403))
    storage = DriveOperationStorage(SimpleNamespace(get_access_token=lambda owner: 'synthetic'))
    with pytest.raises(AppError) as error:
        storage.read('alice', 'bookmark')
    assert error.value.code == 'DRIVE_ACCESS_REQUIRED'


def test_invalid_saved_json_is_not_treated_as_missing(monkeypatch):
    listing = response({'files': [{'id': 'file', 'createdTime': '2026-09-08T00:00:00Z'}]})
    content = response({})
    content.iter_content.return_value = [b'not json']
    get = Mock(side_effect=[listing, content])
    monkeypatch.setattr('app.infrastructure.drive_records.requests.get', get)
    storage = DriveOperationStorage(SimpleNamespace(get_access_token=lambda owner: 'synthetic'))
    with pytest.raises(AppError) as error: storage.read('alice', 'bookmark')
    assert error.value.code == 'RECORDS_UNREADABLE'


def test_unconfirmed_write_is_not_retried(monkeypatch):
    import requests
    monkeypatch.setattr('app.infrastructure.drive_records.requests.get', lambda *a, **k: response({'files': [{'id': 'folder'}]}))
    post = Mock(side_effect=requests.Timeout())
    monkeypatch.setattr('app.infrastructure.drive_records.requests.post', post)
    storage = DriveOperationStorage(SimpleNamespace(get_access_token=lambda owner: 'synthetic'))
    op = RecordOperation(owner='alice', operationId='op', recordType='bookmark', recordId=1, action='create', payload={})
    with pytest.raises(AppError) as error: storage.append('alice', op)
    assert error.value.code == 'SAVE_UNCONFIRMED' and post.call_count == 1


def test_cache_rechecks_access_metadata_and_clears_on_identity_change(monkeypatch):
    owner = 'alice'
    checksum = 'first'
    revoked = False
    downloads = []
    def get(url, **kwargs):
        if kwargs['params'].get('alt') == 'media':
            downloads.append(owner)
            op = RecordOperation(owner=owner, operationId='op', recordType='bookmark',
                recordId=1, action='create', payload={'id': 1})
            result = response({})
            result.iter_content.return_value = [op.model_dump_json().encode()]
            return result
        return response({'files': [{'id': 'file', 'createdTime': '2026-09-08T00:00:00Z',
            'modifiedTime': '2026-09-08T00:00:00Z', 'md5Checksum': checksum}]}, 403 if revoked else 200)
    monkeypatch.setattr('app.infrastructure.drive_records.requests.get', get)
    storage = DriveOperationStorage(SimpleNamespace(get_access_token=lambda identity: 'synthetic'))
    storage.read(owner, 'bookmark')
    storage.read(owner, 'bookmark')
    assert downloads == ['alice']
    checksum = 'changed'
    storage.read(owner, 'bookmark')
    assert downloads == ['alice', 'alice']
    revoked = True
    with pytest.raises(AppError): storage.read(owner, 'bookmark')
    revoked = False
    owner = 'bob'
    storage.read(owner, 'bookmark')
    assert len(storage._cache) == 1
    assert all(key[0] == 'bob' for key in storage._cache)


def test_upload_uses_drive_multipart_related_protocol(monkeypatch):
    import json
    from email import policy
    from email.parser import BytesParser
    monkeypatch.setattr('app.infrastructure.drive_records.requests.get', lambda *a, **k: response({'files': [{'id': 'folder'}]}))
    post = Mock(return_value=response({'id': 'saved-file'}))
    monkeypatch.setattr('app.infrastructure.drive_records.requests.post', post)
    storage = DriveOperationStorage(SimpleNamespace(get_access_token=lambda owner: 'synthetic'))
    op = RecordOperation(owner='alice', operationId='op', recordType='bookmark', recordId=1, action='create', payload={'note': '日本語'})
    assert storage.append('alice', op) == 'saved-file'
    request = post.call_args.kwargs
    message = BytesParser(policy=policy.default).parsebytes(
        ('Content-Type: ' + request['headers']['Content-Type'] + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + request['data'])
    assert message.get_content_type() == 'multipart/related'
    metadata, content = list(message.iter_parts())
    assert json.loads(metadata.get_payload(decode=True))['parents'] == ['folder']
    assert RecordOperation.model_validate_json(content.get_payload(decode=True)) == op
