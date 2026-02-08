"""Inbound controller for OCR routes (keeps Flask routes thin)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator, Optional

from .errors import OcrUnavailableError, InvalidOcrUploadError
from .service import OCRService


@dataclass(frozen=True)
class OcrController:
    ocr_service: OCRService | None
    init_error: str | None = None

    def stream_from_upload(self, *, pdf_file: Any) -> tuple[Iterator[bytes], str]:
        """Validate an uploaded file-like and return the OCR stream + filename."""
        if self.ocr_service is None:
            msg = "OCR service not available."
            if self.init_error:
                msg += f" Error: {self.init_error}"
            else:
                msg += (
                    " Please ensure google-cloud-vision and PyMuPDF are installed, and "
                    "Google Cloud credentials are configured."
                )
            raise OcrUnavailableError(msg)

        if pdf_file is None:
            raise InvalidOcrUploadError("No PDF file provided")

        filename = str(getattr(pdf_file, "filename", "") or "")
        if filename.strip() == "":
            raise InvalidOcrUploadError("No file selected")

        if not filename.lower().endswith(".pdf"):
            raise InvalidOcrUploadError("File must be a PDF")

        # Read bytes from the upload object (e.g., Werkzeug FileStorage).
        read_fn = getattr(pdf_file, "read", None)
        if not callable(read_fn):
            raise InvalidOcrUploadError("Invalid upload object")

        pdf_bytes = read_fn()
        if not pdf_bytes:
            raise InvalidOcrUploadError("PDF file is empty")

        stream = self.ocr_service.stream_process_pdf(pdf_bytes, filename=filename)
        return stream, filename


__all__ = ["OcrController"]

