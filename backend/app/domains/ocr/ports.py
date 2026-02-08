"""OCR domain ports (hexagonal interfaces)."""

from __future__ import annotations

from typing import Callable, Protocol

ProgressCallback = Callable[[int, int], None]


class OcrProcessorPort(Protocol):
    """Outbound port for OCR processing."""

    def process_pdf(self, pdf_bytes: bytes, progress_callback: ProgressCallback | None = None) -> bytes:
        """Return an OCR-processed PDF as bytes."""

