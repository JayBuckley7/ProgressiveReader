"""OCR domain service (use-case).

This service depends only on the OCR port. Vendor SDKs belong in adapters/.
"""
from __future__ import annotations

import json
import logging
import queue
import threading
import time
from typing import Iterator

from .ports import OcrProcessorPort, ProgressCallback

logger = logging.getLogger(__name__)


class OCRService:
    """Use-case wrapper around an OCR processor port."""

    def __init__(self, processor: OcrProcessorPort) -> None:
        self._processor = processor

    def process_pdf(self, pdf_bytes: bytes, progress_callback: ProgressCallback | None = None) -> bytes:
        return self._processor.process_pdf(pdf_bytes, progress_callback=progress_callback)

    def stream_process_pdf(self, pdf_bytes: bytes, *, filename: str) -> Iterator[bytes]:
        """Yield progress updates and the final PDF as a binary stream.

        This is an application-level use-case (framework-agnostic). Flask-specific
        response wiring lives in routes.py.
        """
        progress_queue: queue.Queue[dict] = queue.Queue()
        result_queue: queue.Queue[tuple[str, object]] = queue.Queue()
        pdf_sent = False  # Guard to prevent sending PDF multiple times

        def collect_progress(page_num: int, total_pages: int) -> None:
            progress_data = {
                "type": "progress",
                "page": page_num,
                "total": total_pages,
                "percent": int((page_num / total_pages) * 100),
            }
            progress_queue.put(progress_data)

        def process_in_thread() -> None:
            try:
                logger.info("[ocr] Starting OCR processing thread for PDF: %s bytes", len(pdf_bytes))
                ocr_pdf_bytes = self.process_pdf(pdf_bytes, progress_callback=collect_progress)
                logger.info("[ocr] OCR processing completed successfully: %s bytes", len(ocr_pdf_bytes))
                result_queue.put(("success", ocr_pdf_bytes))
            except Exception as e:
                logger.error("[ocr] OCR processing error in thread: %s", e, exc_info=True)
                result_queue.put(("error", str(e)))

        thread = threading.Thread(target=process_in_thread, daemon=True)
        thread.start()

        while True:
            try:
                # Progress updates (non-blocking)
                try:
                    progress_update = progress_queue.get_nowait()
                    yield f"data: {json.dumps(progress_update)}\n\n".encode("utf-8")
                except queue.Empty:
                    pass

                # Completion result (non-blocking)
                if not pdf_sent:
                    try:
                        status, result = result_queue.get_nowait()
                        if status == "success":
                            assert isinstance(result, (bytes, bytearray))
                            pdf_sent = True
                            completion_data = {
                                "type": "complete",
                                "filename": filename,
                                "size": len(result),
                            }
                            yield f"data: {json.dumps(completion_data)}\n\n".encode("utf-8")

                            logger.info("[ocr] Streaming PDF: %s bytes", len(result))
                            chunk_size = 8192  # 8KB chunks
                            for i in range(0, len(result), chunk_size):
                                yield bytes(result[i : i + chunk_size])
                            return

                        error_data = {"type": "error", "error": result}
                        yield f"data: {json.dumps(error_data)}\n\n".encode("utf-8")
                        return
                    except queue.Empty:
                        pass

                # Thread ended unexpectedly without result (should be rare)
                if not pdf_sent and not thread.is_alive():
                    error_data = {"type": "error", "error": "OCR processing failed unexpectedly"}
                    yield f"data: {json.dumps(error_data)}\n\n".encode("utf-8")
                    return

                if pdf_sent:
                    return

                time.sleep(0.1)  # avoid busy-waiting

            except Exception as e:
                logger.error("Error in OCR stream generator: %s", e, exc_info=True)
                error_data = {"type": "error", "error": str(e)}
                yield f"data: {json.dumps(error_data)}\n\n".encode("utf-8")
                return
