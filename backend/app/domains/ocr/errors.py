"""OCR domain errors (used by inbound adapters)."""

from __future__ import annotations


class OcrUnavailableError(RuntimeError):
    pass


class InvalidOcrUploadError(ValueError):
    pass


__all__ = ["OcrUnavailableError", "InvalidOcrUploadError"]

