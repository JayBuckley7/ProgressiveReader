import sqlite3
import pytest
from app.infrastructure.record_migration import export_sqlite, reconcile, import_records, checksum
from test_drive_records import MemoryDrive


def row(owner='alice', value='word'):
    return dict(owner=owner, kind='vocabulary', id=1, payload=dict(id='1', word=value, translation='meaning',
        language='Japanese', bookId=None, context=None, difficulty=None, mastered=False, createdAt=None))


def export(rows, source='one'):
    return dict(schemaVersion=1, source=source, count=len(rows), checksum=checksum(rows), records=rows)


def test_conflicting_and_ownerless_data_is_quarantined():
    plan = reconcile([export([row(), row(None)]), export([row(value='different')], 'two')])
    assert plan['blockedOwners'] == ['alice']
    assert len(plan['quarantine']) == 3
    assert import_records(plan, MemoryDrive(), apply=True)['readyOwners'] == []


def test_import_preserves_ids_and_is_repeatable_and_verifies():
    plan = reconcile([export([row()]), export([row()], 'two')])
    drive = MemoryDrive()
    before = import_records(plan, drive)
    assert before['pendingOwners'] == ['alice'] and not drive.operations
    result = import_records(plan, drive, apply=True)
    assert result['readyOwners'] == ['alice']
    assert len(drive.operations) == 1 and drive.operations[0][2].recordId == 1
    assert import_records(plan, drive, apply=True)['readyOwners'] == ['alice']
    assert len(drive.operations) == 1


def test_unavailable_drive_stays_pending_and_does_not_report_success():
    drive = MemoryDrive()
    drive.fail = True
    result = import_records(reconcile([export([row()])]), drive, apply=True)
    assert result['pendingOwners'] == ['alice'] and result['readyOwners'] == []


def test_export_checksum_rejects_modified_archive():
    data = export([row()])
    data['records'][0]['payload']['word'] = 'changed'
    with pytest.raises(ValueError): reconcile([data])


def test_sqlite_export_is_read_only_and_preserves_notes(tmp_path):
    path = tmp_path / 'legacy.db'
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE bookmark(id INTEGER, user_id TEXT, book_id TEXT, chapter_index INTEGER, position INTEGER, note TEXT, created_at TEXT)')
        db.execute("INSERT INTO bookmark VALUES (7, 'alice', 'book', 3, 42, 'private note', NULL)")
    result = export_sqlite(path, 'synthetic-instance')
    assert result['count'] == 1 and result['records'][0]['payload']['id'] == 7
    assert result['records'][0]['payload']['note'] == 'private note'
    assert reconcile([result])['quarantine'] == []


def test_export_preserves_precise_bookmark_location(tmp_path):
    import json
    path = tmp_path / 'located.db'
    locator = {'version': 2, 'kind': 'pdf', 'pageNumber': 7}
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE bookmark(id INTEGER, user_id TEXT, book_id TEXT, chapter_index INTEGER, position INTEGER, note TEXT, created_at TEXT, locator_json TEXT)')
        db.execute('INSERT INTO bookmark VALUES (1, ?, ?, 6, 0, NULL, NULL, ?)', ('alice', 'book', json.dumps(locator)))
    exported = export_sqlite(path, 'located')
    assert exported['records'][0]['payload']['locator']['pageNumber'] == 7
    drive = MemoryDrive()
    assert import_records(reconcile([exported]), drive, apply=True)['readyOwners'] == ['alice']
    assert drive.operations[0][2].payload['locator']['pageNumber'] == 7
