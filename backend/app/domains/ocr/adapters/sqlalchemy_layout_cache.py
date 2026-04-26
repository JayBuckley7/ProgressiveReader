"""SQLAlchemy-backed persistent cache for OCR page layouts."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any

from ....infrastructure.sqlalchemy.models import OcrPageLayoutCache


class SqlAlchemyOcrLayoutCacheRepository:
    def __init__(self, session: Any) -> None:
        self._session = session

    def get(self, *, content_hash: str, ocr_profile: str) -> dict | None:
        row = (
            self._session.query(OcrPageLayoutCache)
            .filter_by(content_hash=content_hash, ocr_profile=ocr_profile)
            .first()
        )
        if row is None:
            return None

        row.last_accessed_at = datetime.now(timezone.utc)
        self._session.add(row)
        self._session.commit()
        return json.loads(row.layout_json)

    def save(
        self,
        *,
        content_hash: str,
        ocr_profile: str,
        document_id: str | None,
        document_version: str | None,
        page_index: int,
        image_width: int,
        image_height: int,
        layout: dict,
    ) -> dict:
        row = (
            self._session.query(OcrPageLayoutCache)
            .filter_by(content_hash=content_hash, ocr_profile=ocr_profile)
            .first()
        )
        if row is None:
            row = OcrPageLayoutCache(
                content_hash=content_hash,
                ocr_profile=ocr_profile,
            )

        row.document_id = document_id
        row.document_version = document_version
        row.page_index = page_index
        row.image_width = image_width
        row.image_height = image_height
        row.layout_json = json.dumps(layout, ensure_ascii=False)

        self._session.add(row)
        self._session.commit()
        return layout
