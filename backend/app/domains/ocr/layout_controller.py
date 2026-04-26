"""Inbound controller for page-image OCR layout routes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .errors import InvalidOcrUploadError, OcrUnavailableError
from .layout_service import OcrLayoutService


@dataclass(frozen=True)
class OcrLayoutController:
    service: OcrLayoutService | None
    init_error: str | None = None

    def extract_from_upload(
        self,
        *,
        image_file: Any,
        ocr_profile: str,
        page_index: int,
        document_id: str | None,
        document_version: str | None,
    ) -> dict:
        if self.service is None:
            msg = "OCR layout service not available."
            if self.init_error:
                msg += f" Error: {self.init_error}"
            raise OcrUnavailableError(msg)

        if image_file is None:
            raise InvalidOcrUploadError("No page image provided")

        filename = str(getattr(image_file, "filename", "") or "")
        if filename.strip() == "":
            raise InvalidOcrUploadError("No file selected")

        read_fn = getattr(image_file, "read", None)
        if not callable(read_fn):
            raise InvalidOcrUploadError("Invalid upload object")

        image_bytes = read_fn()
        if not image_bytes:
            raise InvalidOcrUploadError("Page image is empty")

        resp = self.service.extract_or_get_cached(
            image_bytes=image_bytes,
            ocr_profile=ocr_profile,
            page_index=page_index,
            document_id=document_id,
            document_version=document_version,
        )
        return resp.model_dump()
