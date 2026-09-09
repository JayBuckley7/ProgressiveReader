import requests
from ..core.comic_library import ComicOperation, ComicChange, materialize_comics
from ..core.errors import AppError, require_identity
from .drive_records import DriveOperationStorage, BASE, TIMEOUT


class ComicLibrary:
    def __init__(self, provider):
        self.storage = DriveOperationStorage(provider, ComicOperation, materialize_comics)

    def read(self, owner):
        require_identity(owner)
        return materialize_comics(self.storage.read(owner, 'comic-library-v1'), owner)

    def _validate_book(self, owner, book_id):
        try:
            response = requests.get(f'{BASE}/{book_id}', headers=self.storage._headers(owner),
                params={'fields': 'id,name,mimeType,trashed,ownedByMe'}, timeout=TIMEOUT)
        except requests.RequestException as exc:
            raise AppError('DRIVE_UNAVAILABLE', 'The comic could not be checked in Drive. Your edit remains pending.') from exc
        if response.status_code == 404:
            raise AppError('BOOK_NOT_FOUND', 'This comic is no longer in your Drive.', 404)
        self.storage._check(response)
        data = response.json()
        if data.get('trashed') or not data.get('ownedByMe') or not (data.get('name', '').lower().endswith('.cbz') or data.get('mimeType') == 'application/vnd.comicbook+zip'):
            raise AppError('BOOK_NOT_FOUND', 'This comic is not in your Drive library.', 404)

    def write(self, owner, change: ComicChange):
        require_identity(owner)
        operations = self.storage.read(owner, 'comic-library-v1')
        operation = ComicOperation(owner=owner, **change.model_dump())
        for _, _, previous in operations:
            if previous.operationId == change.operationId:
                if previous != operation:
                    raise AppError('IDEMPOTENCY_CONFLICT', 'This save identifier was reused for different data.', 409)
                return materialize_comics(operations, owner)
        kind, record_id = change.recordId.split(':', 1)
        if kind in ('chapter', 'progress'):
            self._validate_book(owner, record_id)
        if kind == 'series' and change.value and change.value.get('coverBookId'):
            self._validate_book(owner, change.value['coverBookId'])
        state = materialize_comics(operations, owner)
        if kind == 'chapter' and change.value and change.value.get('seriesId'):
            if not state['records'].get('series:' + change.value['seriesId'], {}).get('value'):
                raise AppError('SERIES_NOT_FOUND', 'Refresh the library before assigning this series.', 409)
        record = state['records'].get(change.recordId, {'revision': None, 'conflicts': []})
        if change.resolves and (change.baseRevision != record['revision'] or set(change.resolves) != {item['revision'] for item in record['conflicts']}):
            raise AppError('COMIC_CONFLICT_CHANGED', 'New changes arrived. Review the latest conflict before saving.', 409)
        self.storage.append(owner, operation)
        return self.read(owner)
