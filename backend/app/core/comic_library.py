"""Versioned CBZ organization and progress, independent of legacy saved collections."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .errors import AppError, require_identity


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)


class SourceReference(StrictModel):
    package: str = Field(max_length=255)
    sourceId: str = Field(max_length=100)
    mangaUrl: str = Field(max_length=2048)


class Series(StrictModel):
    title: str = Field(min_length=1, max_length=1000)
    coverBookId: str | None = Field(default=None, max_length=200, pattern=r'^[a-zA-Z0-9_-]+$')
    folderId: str | None = Field(default=None, max_length=200, pattern=r'^[a-zA-Z0-9_-]+$')
    source: SourceReference | None = None
    edition: str = Field(default='', max_length=500)


class Chapter(StrictModel):
    seriesId: str | None = Field(default=None, max_length=200, pattern=r'^[a-zA-Z0-9_-]+$')
    title: str = Field(min_length=1, max_length=1000)
    volume: str = Field(default='', max_length=100)
    number: str = Field(default='', max_length=100)
    manualOrder: float | int | None = None
    pageCount: int | None = Field(default=None, ge=1, le=5000)


class Progress(StrictModel):
    page: int = Field(ge=1, le=5000)
    pageCount: int = Field(ge=1, le=5000)
    status: Literal['unread', 'reading', 'read']
    updatedAt: int = Field(ge=0)

    @model_validator(mode='after')
    def valid_page(self):
        if self.page > self.pageCount:
            raise ValueError('Page exceeds chapter length')
        return self


class ComicChange(StrictModel):
    operationId: str = Field(min_length=1, max_length=200, pattern=r'^[a-zA-Z0-9_.:-]+$')
    recordId: str = Field(min_length=1, max_length=220, pattern=r'^(series|chapter|progress):[a-zA-Z0-9_-]+$')
    baseRevision: str | None = Field(default=None, max_length=200)
    resolves: list[str] = Field(default_factory=list, max_length=100)
    value: dict | None

    @model_validator(mode='after')
    def valid_value(self):
        kind = self.recordId.split(':')[0]
        if self.value is not None:
            cls = {'series': Series, 'chapter': Chapter, 'progress': Progress}[kind]
            cls.model_validate(self.value)
        return self


class ComicOperation(ComicChange):
    schemaVersion: Literal[1] = 1
    owner: str = Field(min_length=1, max_length=255)
    recordType: Literal['comic-library-v1'] = 'comic-library-v1'


def materialize_comics(operations, owner, kind='comic-library-v1'):
    require_identity(owner)
    records, seen = {}, {}
    for created, file_id, op in sorted(operations, key=lambda item: (item[0], item[1])):
        if op.owner != owner or op.recordType != kind:
            raise AppError('RECORDS_CORRUPT', 'Comic records failed ownership validation.')
        encoded = op.model_dump()
        if op.operationId in seen:
            if seen[op.operationId] != encoded:
                raise AppError('IDEMPOTENCY_CONFLICT', 'This save identifier was reused for different data.', 409)
            continue
        seen[op.operationId] = encoded
        record = records.setdefault(op.recordId, {'revision': None, 'value': None, 'conflicts': []})
        if op.baseRevision != record['revision']:
            record['conflicts'].append({'revision': op.operationId, 'value': op.value})
            continue
        existing_conflicts = {item['revision'] for item in record['conflicts']}
        if not set(op.resolves).issubset(existing_conflicts):
            raise AppError('RECORDS_CORRUPT', 'Comic conflict resolution references missing changes.')
        record.update(revision=op.operationId, value=op.value)
        record['conflicts'] = [item for item in record['conflicts'] if item['revision'] not in op.resolves]
    return {'schemaVersion': 1, 'records': records}
