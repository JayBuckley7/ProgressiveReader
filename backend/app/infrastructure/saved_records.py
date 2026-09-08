"""Coordination for append-only Drive repositories and staged migration gates."""
import hashlib
import json
from pathlib import Path
from uuid import uuid4
from ..core.errors import AppError, require_identity
from ..core.record_operations import RecordOperation, materialize


class MigrationGate:
    def __init__(self, manifest_path=None, writes_paused=False):
        self.manifest_path, self.writes_paused = manifest_path, writes_paused

    def check(self, owner, *, write=False):
        require_identity(owner)
        if write and self.writes_paused:
            raise AppError('SAVES_PAUSED', 'Cloud saves are temporarily paused for migration. Reading is still available.', 503)
        try:
            state = json.loads(Path(self.manifest_path).read_text(encoding='utf-8')) if self.manifest_path else {}
            if state.get('schemaVersion') != 1:
                raise ValueError('Invalid migration state')
            pending = state.get('pendingOwners', [])
            ready = state.get('readyOwners', [])
            if not isinstance(pending, list) or not isinstance(ready, list):
                raise ValueError('Invalid owner lists')
            if owner in pending or (owner not in ready and state.get('allowNewUsers') is not True):
                raise ValueError('Pending owner')
        except (OSError, ValueError, TypeError):
            raise AppError('MIGRATION_REQUIRED', 'Cloud records are awaiting migration verification. Keep new saves locally for now.', 409)


class SavedRecords:
    def __init__(self, storage, gate, operation_id=lambda: None):
        self.storage, self.gate, self.operation_id = storage, gate, operation_id

    def read(self, owner, kind):
        self.gate.check(owner)
        return materialize(self.storage.read(owner, kind), owner, kind)

    def write(self, owner, kind, action, payload, record_id=None):
        self.gate.check(owner, write=True)
        supplied = self.operation_id()
        if supplied is not None and (not isinstance(supplied, str) or not 1 <= len(supplied) <= 120 or not supplied.isascii()):
            raise AppError('INVALID_IDEMPOTENCY_KEY', 'Save identifier must contain 1–120 ASCII characters.', 400)
        operation_id = supplied or str(uuid4())
        operations = self.storage.read(owner, kind)
        existing_records = materialize(operations, owner, kind)
        for _, _, existing in operations:
            if existing.operationId == operation_id:
                compared = {key: value for key, value in existing.payload.items() if key not in ('id', 'createdAt')}
                if existing.action != action or (record_id is not None and existing.recordId != record_id) or compared != payload:
                    raise AppError('IDEMPOTENCY_CONFLICT', 'This save identifier already belongs to different data.', 409)
                # Return the original operation result, even if later updates changed the record.
                return existing.payload if action == 'create' else existing_records.get(existing.recordId)
        if action != 'create' and record_id not in existing_records:
            return None
        if action == 'create':
            # Safe integer for JSON/JavaScript; stable for concurrent retries of the same operation.
            record_id = int.from_bytes(hashlib.sha256(f'{owner}:{kind}:{operation_id}'.encode()).digest()[:6], 'big') or 1
            if record_id in existing_records:
                raise AppError('RECORD_ID_CONFLICT', 'Save identifier collision. Start a new save.', 409)
            # Deterministic timestamp for retries isn't necessary: reuse existing operation above;
            # concurrent identical operations must have identical payload, so use no client clock here.
            payload = {**payload, 'id': str(record_id) if kind == 'vocabulary' else record_id, 'createdAt': None}
        operation = RecordOperation(owner=owner, operationId=operation_id, recordType=kind, recordId=record_id, action=action, payload=payload)
        self.storage.append(owner, operation)
        return payload if action == 'create' else {**existing_records[record_id], **payload}
