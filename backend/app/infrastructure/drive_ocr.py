"""Immutable, image-addressed OCR sidecars shared by web and Android."""
import json
import re
from uuid import uuid4
from typing import Literal

import requests
from pydantic import BaseModel, ConfigDict, Field

from .drive_records import DriveOperationStorage, BASE, UPLOAD, TIMEOUT
from ..core.errors import AppError, require_identity


class Region(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    text: str = Field(min_length=1, max_length=10000)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)
    direction: Literal['horizontal', 'vertical'] | None = None


class OcrSidecar(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: int = Field(default=1, ge=1, le=1)
    engine: Literal['legacy', 'tesseract-auto', 'tesseract-vertical', 'mlkit-japanese-v2'] = 'legacy'
    revision: str | None = Field(default=None, pattern=r'^[a-f0-9]{32}$')
    regions: list[Region] = Field(max_length=5000)


class DriveOcrStorage(DriveOperationStorage):
    def page(self, owner, image_hash, payload=None):
        try:
            return self._page(owner, image_hash, payload)
        except requests.RequestException as exc:
            raise AppError('OCR_SYNC_UNAVAILABLE', 'OCR is local; Drive sync could not be confirmed.', 503) from exc

    def _page(self, owner, image_hash, payload=None):
        require_identity(owner)
        if not re.fullmatch('[a-f0-9]{64}', image_hash):
            raise AppError('INVALID_OCR_HASH', 'Invalid image fingerprint.', 400)
        encoded = None
        if payload is not None:
            encoded = OcrSidecar.model_validate(payload).model_dump_json(exclude_none=True).encode()
            if len(encoded) > 512000:
                raise AppError('OCR_TOO_LARGE', 'OCR page is too large.', 413)
        headers = self._headers(owner)
        props = {**self._properties(owner, 'ocr-page-v1'), 'pr_image': image_hash}
        items = self._list(headers, props)
        rank = {'legacy': 0, 'tesseract-auto': 1, 'tesseract-vertical': 2, 'mlkit-japanese-v2': 3}
        incoming_engine = json.loads(encoded)['engine'] if encoded else None
        revision = json.loads(encoded).get('revision') if encoded else None
        matches = [item for item in items if item.get('appProperties', {}).get('pr_engine', 'legacy') == incoming_engine
                   and item.get('appProperties', {}).get('pr_revision') == revision]
        if items and (encoded is None or matches):
            # Retain engine variants and prefer Japanese ML Kit, then vertical
            # Tesseract. Break ties deterministically; never overwrite a whole book.
            candidates = matches or items
            if encoded is None:
                android = [item for item in candidates if item.get('appProperties', {}).get('pr_engine', '').startswith('mlkit-japanese-')]
                candidates = android or candidates
            repaired = [item for item in candidates if item.get('appProperties', {}).get('pr_revision')]
            # Explicit repairs supersede engine rankings, retaining every old file.
            # Retrying the same revision reuses its file rather than replacing it.
            item = max(repaired, key=lambda item: (item.get('createdTime', ''), item['id'])) if repaired else min(candidates, key=lambda item: (-rank.get(item.get('appProperties', {}).get('pr_engine', 'legacy'), 0), item.get('createdTime', ''), item['id']))
            response = requests.get(f"{BASE}/{item['id']}", headers=headers,
                                    params={'alt': 'media'}, timeout=TIMEOUT, stream=True)
            self._check(response)
            with response:
                content = bytearray()
                for chunk in response.iter_content(65536):
                    content.extend(chunk)
                    if len(content) > 512000:
                        raise AppError('OCR_CORRUPT', 'Saved OCR page exceeds the size limit.')
            return OcrSidecar.model_validate_json(content).model_dump(exclude_none=True)
        if encoded is None:
            return None
        folders = self._list(headers, self._properties(owner, 'ocr-folder-v1'))
        if folders:
            folder = min(item['id'] for item in folders)
        else:
            response = requests.post(BASE, headers=headers, json={
                'name': 'ProgressiveReader OCR v1', 'mimeType': 'application/vnd.google-apps.folder',
                'appProperties': self._properties(owner, 'ocr-folder-v1'),
            }, timeout=TIMEOUT)
            self._check(response)
            folder = response.json()['id']
        metadata = {'name': image_hash + '.json', 'mimeType': 'application/json',
                    'parents': [folder], 'appProperties': {**props, 'pr_engine': incoming_engine, **({'pr_revision': revision} if revision else {})}}
        boundary = 'pr_' + uuid4().hex
        body = (f'--{boundary}\r\nContent-Type: application/json\r\n\r\n'.encode()
                + json.dumps(metadata).encode()
                + f'\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n'.encode()
                + encoded + f'\r\n--{boundary}--\r\n'.encode())
        response = requests.post(UPLOAD, headers={**headers, 'Content-Type': f'multipart/related; boundary={boundary}'},
                                 data=body, timeout=TIMEOUT)
        self._check(response)
        return json.loads(encoded)
