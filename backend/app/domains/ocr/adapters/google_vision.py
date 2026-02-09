"""Google Vision + PyMuPDF OCR adapter.

This is an outbound adapter that implements the OCR port using:
- google-cloud-vision for OCR
- PyMuPDF (imported as `fitz`) for PDF rendering/editing
"""

from __future__ import annotations

import json
import logging
import os
from io import BytesIO

from ..ports import OcrProcessorPort, ProgressCallback

try:
    from google.cloud import vision
    from google.oauth2 import service_account
except ImportError:  # pragma: no cover - depends on optional vendor deps
    vision = None
    service_account = None

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover - depends on optional vendor deps
    fitz = None

logger = logging.getLogger(__name__)


class GoogleVisionOcrProcessor(OcrProcessorPort):
    """OCR processor backed by Google Cloud Vision and PyMuPDF."""

    def __init__(self, *, credentials_json: str | None = None) -> None:
        if vision is None or service_account is None:
            raise ImportError("google-cloud-vision is not installed")
        if fitz is None:
            raise ImportError("PyMuPDF is not installed")

        self._client = None
        self._credentials_json = credentials_json

    @property
    def client(self):
        # Convenience for tests/patching; initialized lazily.
        return self._get_client()

    def _get_client(self):
        """Return a Vision client, creating it on first use."""
        if self._client is not None:
            return self._client

        # Initialize Vision API client.
        # The container is responsible for reading env/config and passing credentials_json.
        try:
            creds_json_str = self._credentials_json
            if creds_json_str:
                creds_info = json.loads(creds_json_str)
                creds = service_account.Credentials.from_service_account_info(creds_info)
                self._client = vision.ImageAnnotatorClient(credentials=creds)
                logger.info("Initialized Vision API client with explicit service account credentials")
            else:
                logger.info("Initialized Vision API client with ADC (no credentials_json provided)")
                self._client = vision.ImageAnnotatorClient()
        except json.JSONDecodeError as e:
            logger.error("Failed to parse credentials_json: %s", e)
            raise RuntimeError(f"Invalid credentials_json format: {e}")
        except Exception as e:
            logger.error("Failed to initialize Vision API client: %s", e)
            raise

        return self._client

    def _is_vertical_text(self, paragraph) -> bool:
        """Heuristic for detecting vertical paragraphs from Vision bounding boxes."""
        try:
            box = getattr(paragraph, "bounding_box", None)
            vertices = getattr(box, "vertices", None) if box else None
            if not vertices:
                return False
            xs = [v.x for v in vertices]
            ys = [v.y for v in vertices]
            width = max(xs) - min(xs)
            height = max(ys) - min(ys)
            if width <= 0:
                return True
            return (height / width) >= 2.2
        except Exception:
            return False

    def _apply_ocr_response_to_page(
        self,
        output_page,
        response,
        page_width: float,
        page_height: float,
        img_width: int,
        img_height: int,
        cjk_font_path: str,
    ) -> None:
        """Overlay OCR text onto a page (invisible after the image is drawn on top)."""
        _ = cjk_font_path  # Reserved for future explicit font handling.

        if getattr(response, "error", None) is not None and getattr(response.error, "code", 0) != 0:
            raise Exception(f"Error in OCR: {response.error.message}")

        if not img_width or not img_height:
            return

        scale_x = page_width / img_width
        scale_y = page_height / img_height

        if getattr(response, "full_text_annotation", None):
            full_text = response.full_text_annotation
            for vpage in getattr(full_text, "pages", []) or []:
                for block in getattr(vpage, "blocks", []) or []:
                    for paragraph in getattr(block, "paragraphs", []) or []:
                        for word in getattr(paragraph, "words", []) or []:
                            box = getattr(word, "bounding_box", None)
                            vertices = getattr(box, "vertices", None) if box else None
                            if not vertices or len(vertices) < 3:
                                continue

                            x_coords = [v.x for v in vertices]
                            y_coords = [v.y for v in vertices]
                            x_min = min(x_coords)
                            y_min = min(y_coords)
                            x_max = max(x_coords)
                            y_max = max(y_coords)

                            pdf_x = x_min * scale_x
                            pdf_y = y_min * scale_y
                            pdf_width = (x_max - x_min) * scale_x
                            pdf_height = (y_max - y_min) * scale_y

                            text = "".join(symbol.text for symbol in getattr(word, "symbols", []) or [])
                            if not text.strip():
                                continue

                            font_size = max(min(pdf_height, 18), 6)
                            text_rect = fitz.Rect(pdf_x, pdf_y, pdf_x + pdf_width, pdf_y + pdf_height)
                            html_word = f'<span style="font-size:{font_size}px; color:#ffffff;">{text}</span>'
                            output_page.insert_htmlbox(text_rect, html_word)
            return

        # Fallback to text_detection style results.
        annotations = getattr(response, "text_annotations", None) or []
        for annotation in annotations[1:]:
            poly = getattr(annotation, "bounding_poly", None)
            vertices = getattr(poly, "vertices", None) if poly else None
            if not vertices or len(vertices) < 3:
                continue

            x_coords = [v.x for v in vertices]
            y_coords = [v.y for v in vertices]
            x_min = min(x_coords)
            y_min = min(y_coords)
            x_max = max(x_coords)
            y_max = max(y_coords)

            pdf_x = x_min * scale_x
            pdf_y = y_min * scale_y
            pdf_width = (x_max - x_min) * scale_x
            pdf_height = (y_max - y_min) * scale_y

            text = getattr(annotation, "description", "") or ""
            if not text.strip():
                continue

            font_size = max(min(pdf_height, 18), 6)
            text_rect = fitz.Rect(pdf_x, pdf_y, pdf_x + pdf_width, pdf_y + pdf_height)
            html_word = f'<span style="font-size:{font_size}px; color:#ffffff;">{text}</span>'
            output_page.insert_htmlbox(text_rect, html_word)

    def _find_windows_cjk_font(self) -> str:
        """Best-effort lookup for a Windows-installed CJK font.

        Keep this Windows-only and avoid registry access so the adapter stays
        deployable in Linux container environments.
        """
        if os.name != "nt":
            return ""

        fonts_dir = os.path.join(os.environ.get("WINDIR", r"C:\\Windows"), "Fonts")

        # Common CJK font filenames across Windows installs. We only need a path that exists.
        preferred_files = [
            "YuGothR.ttc",
            "YuGothB.ttc",
            "YuGothM.ttc",
            "meiryo.ttc",
            "meiryob.ttc",
            "msgothic.ttc",
            "msmincho.ttc",
        ]

        for fn in preferred_files:
            p = os.path.join(fonts_dir, fn)
            if os.path.exists(p):
                return p

        return ""

    def process_pdf(self, pdf_bytes: bytes, progress_callback: ProgressCallback | None = None) -> bytes:
        """Process PDF with OCR and return OCR'd PDF as bytes."""
        if not pdf_bytes:
            raise ValueError("PDF bytes cannot be empty")

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = doc.page_count
        output_doc = None
        try:
            output_doc = fitz.open()

            for page_num in range(doc.page_count):
                if progress_callback:
                    progress_callback(page_num + 1, total_pages)

                page = doc.load_page(page_num)
                pix = page.get_pixmap()

                page_width = page.rect.width
                page_height = page.rect.height
                img_width = pix.width
                img_height = pix.height

                output_page = output_doc.new_page(width=page_width, height=page_height)

                img_bytes = pix.tobytes("png")
                img_rect = fitz.Rect(0, 0, page_width, page_height)

                image = vision.Image(content=img_bytes)

                client = self._get_client()
                response = client.document_text_detection(image=image)

                if response.error.code != 0:
                    raise Exception(f"Error in OCR: {response.error.message}")

                cjk_font_path = ""
                if os.name == "nt":
                    cjk_font_path = self._find_windows_cjk_font()
                if not cjk_font_path:
                    for local in ("NotoSansCJKjp-Regular.otf", "NotoSerifCJKjp-Regular.otf"):
                        p = os.path.join(os.getcwd(), local)
                        if os.path.exists(p):
                            cjk_font_path = p
                            break

                self._apply_ocr_response_to_page(
                    output_page,
                    response,
                    page_width,
                    page_height,
                    img_width,
                    img_height,
                    cjk_font_path,
                )

                # Put the page image on top so the text is invisible but selectable.
                output_page.insert_image(img_rect, stream=img_bytes)

            output_bytes = BytesIO()
            output_doc.save(
                output_bytes,
                garbage=4,
                deflate=True,
                clean=True,
            )

            result_bytes = output_bytes.getvalue()
            logger.info(
                "OCR PDF created: %s bytes (%.2f MB)",
                len(result_bytes),
                (len(result_bytes) / (1024 * 1024)),
            )
            return result_bytes
        finally:
            doc.close()
            if output_doc is not None:
                output_doc.close()
