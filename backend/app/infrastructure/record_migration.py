"""Offline export/reconciliation and idempotent Drive import of legacy saved records."""
import hashlib
import json
import sqlite3
from collections import defaultdict
from pathlib import Path
from ..core.record_operations import RecordOperation, materialize
from ..core.errors import AppError


def checksum(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def export_sqlite(path, source):
    # SQLite backup includes committed WAL contents, unlike a raw copy of app.db.
    uri = Path(path).resolve().as_uri() + '?mode=ro'
    records = []
    with sqlite3.connect(uri, uri=True) as original, sqlite3.connect(':memory:') as snapshot:
        original.backup(snapshot)
        snapshot.row_factory = sqlite3.Row
        tables = {row[0] for row in snapshot.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for table, kind in [('vocabulary', 'vocabulary'), ('bookmark', 'bookmark')]:
            if table not in tables:
                continue
            for raw in snapshot.execute(f'SELECT * FROM {table} ORDER BY id'):
                row = dict(raw)
                if kind == 'vocabulary':
                    payload = dict(id=str(row['id']), word=row['word'], translation=row['translation'],
                        language=row['language'], bookId=row['book_id'], context=row['context'],
                        difficulty=row['difficulty'], mastered=bool(row['mastered']), createdAt=row['created_at'])
                else:
                    payload = dict(id=row['id'], bookId=row['book_id'], chapterIndex=row['chapter_index'],
                        position=row['position'], note=row['note'], createdAt=row['created_at'])
                    if row.get('locator_json'):
                        from ..domains.books.schemas import ReaderLocator
                        # Stop on corrupt optional locations rather than silently dropping them.
                        payload['locator'] = ReaderLocator.model_validate_json(row['locator_json']).model_dump(mode='json')
                records.append({'owner': row['user_id'], 'kind': kind, 'id': row['id'], 'payload': payload})
    return {'schemaVersion': 1, 'source': source, 'count': len(records), 'checksum': checksum(records), 'records': records}


def reconcile(exports):
    groups = defaultdict(list)
    quarantine = []
    for export in exports:
        if export.get('schemaVersion') != 1 or export.get('checksum') != checksum(export['records']) or export.get('count') != len(export['records']):
            raise ValueError('Export integrity verification failed')
        for row in export['records']:
            if not row['owner']:
                quarantine.append({'reason': 'missing_owner', 'source': export['source'], 'record': row})
                continue
            groups[(row['owner'], row['kind'], row['id'])].append((export['source'], row))
    records = []
    blocked = set()
    for key, candidates in groups.items():
        if len({checksum(row) for _, row in candidates}) != 1:
            blocked.add(key[0])
            quarantine.extend({'reason': 'conflicting_record', 'source': source, 'record': row} for source, row in candidates)
        else:
            records.append(candidates[0][1])
    return {'schemaVersion': 1, 'sources': [dict(source=e['source'], checksum=e['checksum'], count=e['count']) for e in exports],
        'records': records, 'quarantine': quarantine, 'blockedOwners': sorted(blocked)}


def import_records(plan, storage, *, apply=False):
    grouped = defaultdict(list)
    for row in plan['records']:
        grouped[row['owner']].append(row)
    ready, pending, failures = [], set(plan['blockedOwners']), {}
    for owner, rows in grouped.items():
        if owner in pending:
            continue
        try:
            by_kind = {kind: storage.read(owner, kind) for kind in ('bookmark', 'vocabulary')}
            existing = {kind: materialize(ops, owner, kind) for kind, ops in by_kind.items()}
            # Preflight the entire owner before writing a single operation.
            for row in rows:
                current = existing[row['kind']].get(row['id'])
                if current is not None and current != row['payload']:
                    raise AppError('MIGRATION_CONFLICT', 'Target record differs from the recovery export.', 409)
            for row in rows:
                op = RecordOperation(owner=owner, operationId='migration-' + checksum(row),
                    recordType=row['kind'], recordId=row['id'], action='create', payload=row['payload'])
                matches = [old for _, _, old in by_kind[row['kind']] if old.operationId == op.operationId]
                if matches and any(old != op for old in matches):
                    raise AppError('MIGRATION_CONFLICT', 'Migration operation differs from recovery export.', 409)
                if not matches and apply:
                    storage.append(owner, op)
            verified = {kind: materialize(storage.read(owner, kind), owner, kind) for kind in ('bookmark', 'vocabulary')}
            if all(verified[row['kind']].get(row['id']) == row['payload'] for row in rows):
                ready.append(owner)
            else:
                pending.add(owner)
        except Exception as exc:
            pending.add(owner)
            # Do not expose credentials or raw provider exception messages in migration reports.
            failures[owner] = exc.code if isinstance(exc, AppError) else type(exc).__name__
    return {'schemaVersion': 1, 'readyOwners': sorted(ready), 'pendingOwners': sorted(pending),
        'allowNewUsers': False, 'failures': failures, 'sourceChecksums': plan['sources']}
