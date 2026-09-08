"""Portable, immutable saved-record operations; no framework or provider imports."""
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field
from .errors import AppError


class RecordOperation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schemaVersion: Literal[1] = 1
    owner: str = Field(min_length=1, max_length=255)
    operationId: str = Field(min_length=1, max_length=200)
    recordType: Literal["vocabulary", "bookmark"]
    recordId: int = Field(gt=0, le=9007199254740991)
    action: Literal["create", "mastered", "delete"]
    payload: dict[str, Any]


def materialize(operations: list[tuple[str, str, RecordOperation]], owner: str, kind: str) -> dict[int, dict]:
    records: dict[int, dict] = {}
    seen: dict[str, dict] = {}
    ordered = sorted(operations, key=lambda item: (item[0], item[1]))
    unique = []
    for created, file_id, op in ordered:
        if op.owner != owner or op.recordType != kind:
            raise AppError("RECORDS_CORRUPT", "Saved records failed ownership validation.")
        body = op.model_dump()
        if op.operationId in seen:
            if seen[op.operationId] != body:
                raise AppError("IDEMPOTENCY_CONFLICT", "A save identifier was reused for different data.", 409)
            continue
        seen[op.operationId] = body
        unique.append((created, op))
    # Creation is independent of listing order and later field updates.
    for created, op in unique:
        if op.action != "create":
            continue
        if op.recordId in records and records[op.recordId] != op.payload:
            raise AppError("RECORD_ID_CONFLICT", "Conflicting saved records require recovery.", 409)
        records[op.recordId] = dict(op.payload)
    for created, op in unique:
        if op.action == "create":
            continue
        if op.recordId not in records:
            raise AppError("RECORDS_CORRUPT", "A saved update has no source record.")
        if op.action == "mastered":
            if kind != "vocabulary" or set(op.payload) != {"mastered"} or type(op.payload['mastered']) is not bool:
                raise AppError("RECORDS_CORRUPT", "Invalid vocabulary update.")
            records[op.recordId]['mastered'] = op.payload['mastered']
        elif op.action == "delete":
            records[op.recordId]['_deleted'] = True
    return {key: value for key, value in records.items() if not value.get('_deleted')}
