"""OCR domain ports (hexagonal interfaces)."""

from __future__ import annotations

from typing import Callable, Protocol

ProgressCallback = Callable[[int, int], None]


class OcrProcessorPort(Protocol):
    """Outbound port for OCR processing."""

    def process_pdf(self, pdf_bytes: bytes, progress_callback: ProgressCallback | None = None) -> bytes:
        """Return an OCR-processed PDF as bytes."""


class OcrLayoutExtractorPort(Protocol):
    """Outbound port for page-image OCR layout extraction."""

    def extract_page_layout(self, image_bytes: bytes, *, ocr_profile: str) -> dict:
        """Return structured OCR layout data for an uploaded page image."""


class OcrLayoutRefinerPort(Protocol):
    """Outbound port for optional OCR text/layout refinement."""

    def refine_page_layout(self, image_bytes: bytes, *, layout: dict, ocr_profile: str) -> dict:
        """Return a refined OCR layout while preserving overlay geometry."""
