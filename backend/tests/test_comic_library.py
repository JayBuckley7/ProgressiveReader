from types import SimpleNamespace
from unittest.mock import Mock
from flask import Flask
import pytest
from app.core.comic_library import ComicOperation, ComicChange, materialize_comics
from app.core.errors import AppError
from app.infrastructure.comic_library import ComicLibrary
from app.domains.comics.routes import comic_library_bp


def op(id, base=None, title='Series', owner='alice', resolves=()):
    return ComicOperation(owner=owner, operationId=id, recordId='series:test', baseRevision=base, value={'title': title}, resolves=list(resolves))


def test_duplicate_retry_and_conflict_resolution_preserve_both_edits():
    a, b, c = op('a'), op('b', 'a', 'Phone'), op('c', 'a', 'Web')
    operations = [('1', 'a', a), ('2', 'b', b), ('3', 'c', c), ('4', 'retry', c)]
    record = materialize_comics(operations, 'alice')['records']['series:test']
    assert record == {'revision': 'b', 'value': {'title': 'Phone'}, 'conflicts': [{'revision': 'c', 'value': {'title': 'Web'}}]}
    operations.append(('5', 'resolve', op('d', 'b', 'Web', resolves=['c'])))
    assert materialize_comics(operations, 'alice')['records']['series:test']['conflicts'] == []
    assert materialize_comics(operations, 'alice')['records']['series:test']['value']['title'] == 'Web'


def test_mixed_owner_and_reused_operation_ids_rejected():
    with pytest.raises(AppError): materialize_comics([('1', 'a', op('a', owner='bob'))], 'alice')
    with pytest.raises(AppError): materialize_comics([('1', 'a', op('a')), ('2', 'b', op('a', title='Changed'))], 'alice')


def test_route_auth_account_and_payload_validation(authenticated_client):
    app = Flask(__name__); app.register_blueprint(comic_library_bp)
    service = Mock(); service.read.return_value = {'schemaVersion': 1, 'records': {}}
    app.extensions['comic_library'] = service
    client = authenticated_client(app)
    assert client.get('/api/comic-library', headers={'Authorization': ''}).status_code == 401
    assert client.get('/api/comic-library', headers={'X-Comic-Account': 'bob'}).status_code == 409
    service.read.assert_not_called()
    assert client.get('/api/comic-library', headers={'X-Comic-Account': 'test-user'}).status_code == 200
    payload = ComicChange(operationId='a', recordId='series:s', value={'title': 'A'}).model_dump()
    assert client.post('/api/comic-library/operations', headers={'X-Comic-Account': 'test-user'}, json={**payload, 'owner': 'bob'}).status_code == 422
    service.write.assert_not_called()


def test_another_users_book_cannot_be_assigned(monkeypatch):
    service = ComicLibrary(SimpleNamespace(get_access_token=lambda owner: 'token'))
    service.storage.read = Mock(return_value=[])
    service.storage.append = Mock()
    response = Mock(ok=True, status_code=200); response.json.return_value = {'name': 'other.cbz', 'ownedByMe': False}
    monkeypatch.setattr('app.infrastructure.comic_library.requests.get', Mock(return_value=response))
    with pytest.raises(AppError) as error:
        service.write('alice', ComicChange(operationId='a', recordId='chapter:other', value={'seriesId': None, 'title': 'Other'}))
    assert error.value.status == 404
    service.storage.append.assert_not_called()


def test_acknowledgement_retry_makes_no_second_write():
    service = ComicLibrary(None)
    previous = op('a')
    service.storage.read = Mock(return_value=[('1', 'file', previous)])
    service.storage.append = Mock()
    change = ComicChange.model_validate(previous.model_dump(exclude={'owner', 'recordType', 'schemaVersion'}))
    assert service.write('alice', change)['records']['series:test']['revision'] == 'a'
    service.storage.append.assert_not_called()


def test_failed_discovery_prevents_any_append():
    service = ComicLibrary(None)
    service.storage.read = Mock(side_effect=AppError('RECORDS_UNREADABLE', 'corrupt'))
    service.storage.append = Mock()
    with pytest.raises(AppError):
        service.write('alice', ComicChange(operationId='x', recordId='series:s', value={'title': 'New'}))
    service.storage.append.assert_not_called()


@pytest.mark.parametrize('value', [{'page': 8, 'pageCount': 2, 'status': 'reading', 'updatedAt': 1},
    {'page': 1, 'pageCount': 2, 'status': 'done', 'updatedAt': 1},
    {'page': 1, 'pageCount': 2, 'status': 'read', 'updatedAt': 1, 'owner': 'bob'}])
def test_invalid_progress_rejected(value):
    from pydantic import ValidationError
    with pytest.raises(ValidationError): ComicChange(operationId='x', recordId='progress:book', value=value)


def test_drive_tie_break_and_separate_chapters_are_deterministic():
    operations = [('1', 'b', op('second', title='B')), ('1', 'a', op('first', title='A')),
        ('1', 'c', ComicOperation(owner='alice', operationId='chapter', recordId='chapter:book', value={'title': 'Chapter', 'seriesId': 'test'}))]
    first = materialize_comics(operations, 'alice')
    assert materialize_comics(list(reversed(operations)), 'alice') == first
    assert first['records']['series:test']['value']['title'] == 'A'
    assert first['records']['series:test']['conflicts'][0]['value']['title'] == 'B'
    assert first['records']['chapter:book']['value']['title'] == 'Chapter'


def test_stale_conflict_resolution_never_appends():
    service = ComicLibrary(None)
    service.storage.read = Mock(return_value=[('1', 'a', op('a')), ('2', 'b', op('b'))])
    service.storage.append = Mock()
    with pytest.raises(AppError) as failure:
        service.write('alice', ComicChange(operationId='resolve', recordId='series:test', baseRevision='wrong', resolves=['b'], value={'title': 'Choice'}))
    assert failure.value.code == 'COMIC_CONFLICT_CHANGED'
    service.storage.append.assert_not_called()
