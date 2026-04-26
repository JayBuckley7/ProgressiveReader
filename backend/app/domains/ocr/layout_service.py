"""Page-image OCR layout service with persistent cache."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from .layout_schemas import OcrPageLayoutResponse
from .ports import OcrLayoutExtractorPort


@dataclass(frozen=True)
class OcrLayoutService:
    extractor: OcrLayoutExtractorPort
    cache_repo: Any

    def extract_or_get_cached(
        self,
        *,
        image_bytes: bytes,
        ocr_profile: str,
        page_index: int,
        document_id: str | None,
        document_version: str | None,
    ) -> OcrPageLayoutResponse:
        resolve_profile = getattr(self.extractor, "resolve_ocr_profile", None)
        if callable(resolve_profile):
            ocr_profile = str(resolve_profile(ocr_profile))

        content_hash = hashlib.sha256(image_bytes).hexdigest()
        cached = self.cache_repo.get(content_hash=content_hash, ocr_profile=ocr_profile)
        if cached is not None:
            return OcrPageLayoutResponse(
                cacheHit=True,
                contentHash=content_hash,
                ocrProfile=ocr_profile,
                pageIndex=page_index,
                image=cached["image"],
                lines=cached.get("lines", []),
                atoms=cached.get("atoms", []),
            )

        layout = self.extractor.extract_page_layout(image_bytes, ocr_profile=ocr_profile)
        saved = self.cache_repo.save(
            content_hash=content_hash,
            ocr_profile=ocr_profile,
            document_id=document_id,
            document_version=document_version,
            page_index=page_index,
            image_width=int(layout.get("image", {}).get("width", 0) or 0),
            image_height=int(layout.get("image", {}).get("height", 0) or 0),
            layout=layout,
        )
        return OcrPageLayoutResponse(
            cacheHit=False,
            contentHash=content_hash,
            ocrProfile=ocr_profile,
            pageIndex=page_index,
            image=saved["image"],
            lines=saved.get("lines", []),
            atoms=saved.get("atoms", []),
        )
