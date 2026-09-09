"""Immutable operation persistence in a user's Drive, isolated by Clerk identity.

Bounded immutable-content cache: every read still authenticates and lists current metadata.
Failed or partial reads can never masquerade as empty data.
Writes are never automatically retried after an uncertain network outcome.
"""
import hashlib
import json
from collections import OrderedDict
from typing import Any
from uuid import uuid4
import requests
from pydantic import ValidationError
from ..core.errors import AppError, require_identity
from ..core.record_operations import RecordOperation, materialize

BASE = 'https://www.googleapis.com/drive/v3/files'
UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'
TIMEOUT = (5, 30)


class DriveOperationStorage:
    def __init__(self, provider):
        self.provider = provider
        self._cache = OrderedDict()
        self._cache_bytes = 0
        self._cache_owner = None

    def _headers(self, owner):
        require_identity(owner)
        if owner != self._cache_owner:
            self._cache.clear()
            self._cache_bytes = 0
            self._cache_owner = owner
        token = self.provider.get_access_token(owner)
        if not token:
            raise AppError('DRIVE_NOT_CONNECTED', 'Connect Google Drive to sync saved records.', 409)
        return {'Authorization': f'Bearer {token}'}

    @staticmethod
    def _check(response):
        if response.status_code in (401, 403):
            raise AppError('DRIVE_ACCESS_REQUIRED', 'Reconnect Google Drive to access saved records.', 409)
        if not response.ok:
            raise AppError('DRIVE_UNAVAILABLE', 'Google Drive could not complete the request. Your save has not been confirmed.')

    @staticmethod
    def _properties(owner, kind):
        return {'pr_owner': hashlib.sha256(owner.encode()).hexdigest(), 'pr_collection': kind, 'pr_schema': '1'}

    def _list(self, headers, properties):
        query = "trashed=false and 'me' in owners and " + ' and '.join(
            f"appProperties has {{ key='{key}' and value='{value}' }}" for key, value in properties.items()
        )
        items, token, seen = [], None, set()
        while True:
            response = requests.get(BASE, headers=headers, params={
                'q': query, 'spaces': 'drive', 'pageSize': 1000,
                'fields': 'nextPageToken,incompleteSearch,files(id,createdTime,mimeType,modifiedTime,md5Checksum,appProperties)', **({'pageToken': token} if token else {}),
            }, timeout=TIMEOUT)
            self._check(response)
            data = response.json()
            if data.get('incompleteSearch') or not isinstance(data.get('files'), list):
                raise AppError('DRIVE_UNAVAILABLE', 'Google Drive returned an incomplete record listing.')
            items.extend(data['files'])
            token = data.get('nextPageToken')
            if not token:
                return items
            if token in seen:
                raise AppError('DRIVE_UNAVAILABLE', 'Google Drive returned an invalid page sequence.')
            seen.add(token)

    def read(self, owner: str, kind: str):
        headers = self._headers(owner)
        try:
            items = self._list(headers, self._properties(owner, kind))
            operations = []
            for item in items:
                cache_key = (owner, item['id'], item.get('modifiedTime'), item.get('md5Checksum'))
                cached = self._cache.get(cache_key)
                if cached is not None:
                    self._cache.move_to_end(cache_key)
                    operations.append((item['createdTime'], item['id'], cached[0]))
                    continue
                response = requests.get(f"{BASE}/{item['id']}", headers=headers, params={'alt': 'media'}, timeout=TIMEOUT, stream=True)
                self._check(response)
                with response:
                    content = bytearray()
                    for chunk in response.iter_content(65536):
                        content.extend(chunk)
                        if len(content) > 262144:
                            raise AppError('RECORDS_CORRUPT', 'A saved operation exceeds the supported size.')
                op = RecordOperation.model_validate_json(content.decode('utf-8'))
                if not item.get('createdTime'):
                    raise AppError('RECORDS_CORRUPT', 'A saved operation has no creation time.')
                # Always list Drive metadata first. Only unchanged content can hit this bounded,
                # identity-scoped cache; failed listing/auth never serves stale cached records.
                if item.get('modifiedTime') and item.get('md5Checksum'):
                    self._cache[cache_key] = (op, len(content))
                    self._cache_bytes += len(content)
                    while len(self._cache) > 128 or self._cache_bytes > 8 * 1024 * 1024:
                        _, (_, size) = self._cache.popitem(last=False)
                        self._cache_bytes -= size
                operations.append((item['createdTime'], item['id'], op))
            materialize(operations, owner, kind)  # Validate before returning even for migration callers.
            return operations
        except (requests.RequestException, ValueError, KeyError, ValidationError) as exc:
            raise AppError('RECORDS_UNREADABLE', 'Saved records could not be read safely. No changes were made.') from exc

    def append(self, owner: str, operation: RecordOperation):
        require_identity(owner)
        if operation.owner != owner:
            raise AppError('AUTH_REQUIRED', 'Record owner mismatch.', 401)
        encoded = operation.model_dump_json().encode('utf-8')
        if len(encoded) > 262144:
            raise AppError('RECORD_TOO_LARGE', 'This saved record is too large. Shorten its context or note.', 413)
        headers = self._headers(owner)
        try:
            # Folder discovery tolerates concurrent folder creation. Records are listed by properties,
            # not by a single folder ID, so no operation disappears in a duplicate folder.
            folders = self._list(headers, self._properties(owner, 'record-folder'))
            if folders:
                folder_id = sorted(item['id'] for item in folders)[0]
            else:
                response = requests.post(BASE, headers=headers, json={
                    'name': 'ProgressiveReader Records v1', 'mimeType': 'application/vnd.google-apps.folder',
                    'appProperties': self._properties(owner, 'record-folder'),
                }, timeout=TIMEOUT)
                self._check(response)
                folder_id = response.json()['id']
            metadata = {
                'name': operation.operationId + '.json', 'mimeType': 'application/json', 'parents': [folder_id],
                'appProperties': self._properties(owner, operation.recordType),
            }
            # Drive's multipart upload uses multipart/related, not form-data.
            boundary = 'pr_' + uuid4().hex
            body = (
                f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'.encode()
                + json.dumps(metadata).encode('utf-8')
                + f'\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n'.encode()
                + encoded + f'\r\n--{boundary}--\r\n'.encode()
            )
            response = requests.post(UPLOAD, headers={**headers,
                'Content-Type': f'multipart/related; boundary={boundary}'}, data=body, timeout=TIMEOUT)
            self._check(response)
            return response.json()['id']
        except (requests.RequestException, ValueError, KeyError) as exc:
            raise AppError('SAVE_UNCONFIRMED', 'Save could not be confirmed. Retry with the same save identifier.') from exc
