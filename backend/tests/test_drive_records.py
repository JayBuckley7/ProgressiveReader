from types import SimpleNamespace
from uuid import uuid4
import pytest
from app.core.errors import AppError
from app.core.record_operations import RecordOperation, materialize
from app.infrastructure.saved_records import SavedRecords, MigrationGate
from app.domains.books.adapters.drive_repository import DriveBooksRepository
from app.domains.vocabulary.adapters.drive_repository import DriveVocabularyRepository


class MemoryDrive:
    def __init__(self):
        self.operations = []
        self.fail = False

    def read(self, owner, kind):
        if self.fail:
            raise AppError('DRIVE_UNAVAILABLE', 'offline')
        return [item for item in self.operations if item[2].owner == owner and item[2].recordType == kind]

    def append(self, owner, op):
        self.operations.append((f'2026-09-08T12:00:{len(self.operations):02d}Z', str(uuid4()), op))


def repositories(storage, operation_id):
    def check(owner, write=False):
        if not owner:
            raise AppError('AUTH_REQUIRED', 'sign in', 401)
    records = SavedRecords(storage, SimpleNamespace(check=check), operation_id)
    return DriveVocabularyRepository(records), DriveBooksRepository(records)


def test_idempotency_and_separate_collections():
    storage = MemoryDrive()
    vocab, books = repositories(storage, lambda: 'same-save')
    first = vocab.add_vocabulary_word('alice', 'word', 'meaning', 'Japanese')
    retry = vocab.add_vocabulary_word('alice', 'word', 'meaning', 'Japanese')
    assert first == retry and len(storage.operations) == 1
    bookmark = books.add_bookmark('book', 2, 123, user_id='alice')
    assert isinstance(bookmark.id, int)
    assert isinstance(first.id, str)
    assert books.get_bookmarks('book', 'bob') == []
    assert vocab.get_user_vocabulary('bob') == []
    with pytest.raises(AppError, match='different data'):
        vocab.add_vocabulary_word('alice', 'different', 'meaning', 'Japanese')


def test_concurrent_writes_duplicates_and_mastered_order():
    storage = MemoryDrive()
    a, _ = repositories(storage, lambda: 'create-a')
    b, _ = repositories(storage, lambda: 'create-b')
    word = a.add_vocabulary_word('alice', 'a', 'a', 'Japanese')
    b.add_vocabulary_word('alice', 'b', 'b', 'Japanese')
    # Concurrent retry of create with exactly identical envelope is safe.
    storage.operations.append(storage.operations[0])
    c, _ = repositories(storage, lambda: 'mastered-1')
    c.toggle_mastered('alice', int(word.id), True)
    d, _ = repositories(storage, lambda: 'mastered-2')
    d.toggle_mastered('alice', int(word.id), False)
    storage.operations.reverse()  # Drive listing order must not affect results.
    rows = a.get_user_vocabulary('alice')
    assert len(rows) == 2 and next(row for row in rows if row.id == word.id).mastered is False


def test_failed_read_never_writes_empty_or_loses_records():
    storage = MemoryDrive()
    vocab, _ = repositories(storage, lambda: None)
    vocab.add_vocabulary_word('alice', 'a', 'a', 'Japanese')
    storage.fail = True
    with pytest.raises(AppError):
        vocab.add_vocabulary_word('alice', 'b', 'b', 'Japanese')
    assert len(storage.operations) == 1


def test_owner_mismatch_fails_closed():
    op = RecordOperation(owner='bob', operationId='x', recordType='bookmark', recordId=1, action='create', payload={})
    with pytest.raises(AppError):
        materialize([('date', 'file', op)], 'alice', 'bookmark')


def test_migration_gate_missing_pending_ready_and_paused(tmp_path):
    import json
    path = tmp_path / 'state.json'
    gate = MigrationGate(str(path))
    with pytest.raises(AppError):
        gate.check('alice')
    path.write_text(json.dumps({'schemaVersion': 1, 'readyOwners': ['alice'], 'pendingOwners': ['bob'], 'allowNewUsers': False}))
    gate.check('alice')
    for owner in ['bob', 'new']:
        with pytest.raises(AppError): gate.check(owner)
    paused = MigrationGate(str(path), True)
    paused.check('alice')
    with pytest.raises(AppError) as err: paused.check('alice', write=True)
    assert err.value.code == 'SAVES_PAUSED'
