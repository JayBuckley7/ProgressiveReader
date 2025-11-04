"""OCR service for processing PDFs with Google Cloud Vision API."""
from __future__ import annotations

import json
import logging
import os
import re
import sys
from io import BytesIO

try:
    from google.cloud import vision
    from google.oauth2 import service_account
except ImportError:
    vision = None
    service_account = None

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

logger = logging.getLogger(__name__)


def safe_decode(text, encoding="utf-8"):
    """
    Tries to decode the text using the given encoding.
    If decoding fails, it returns a fallback message.
    """
    try:
        # Try to decode with the specified encoding (default is UTF-8)
        return text.encode('utf-8').decode(encoding)
    except UnicodeDecodeError:
        # If decoding fails, return the original string with a note
        return f"[Invalid Encoding] {text}"

class OCRService:
    """Service for processing PDFs with OCR."""

    def __init__(self):
        if vision is None:
            raise ImportError("google-cloud-vision is not installed")
        if fitz is None:
            raise ImportError("PyMuPDF is not installed")

        try:
            creds_json_str = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
            if creds_json_str:
                creds_info = json.loads(creds_json_str)
                creds = service_account.Credentials.from_service_account_info(creds_info)
                self.client = vision.ImageAnnotatorClient(credentials=creds)
                logger.info("Initialized Vision API client with service account credentials from environment")
            else:
                logger.warning("GOOGLE_APPLICATION_CREDENTIALS_JSON not found, falling back to ADC")
                self.client = vision.ImageAnnotatorClient()
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON: {e}")
            raise RuntimeError(f"Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON format: {e}")
        except Exception as e:
            logger.error(f"Failed to initialize Vision API client: {e}")
            raise

    def _is_vertical_text(self, paragraph) -> bool:
        """
        Detect if a paragraph contains vertical text (common in Japanese).
        
        Vertical text is identified by checking if the paragraph's height is
        significantly greater than its width (height > width * 1.2).
        
        Args:
            paragraph: Vision API paragraph object with bounding_box
            
        Returns:
            True if the paragraph appears to be vertical text, False otherwise
        """
        if not paragraph.bounding_box or not paragraph.bounding_box.vertices:
            return False
        
        vertices = paragraph.bounding_box.vertices
        if len(vertices) < 3:
            return False
        
        x_coords = [v.x for v in vertices]
        y_coords = [v.y for v in vertices]
        p_width = max(x_coords) - min(x_coords)
        p_height = max(y_coords) - min(y_coords)
        
        return p_height > p_width * 1.2

    def _extract_paragraph_text_with_bbox(self, paragraph) -> tuple[list[str], list[dict]]:
        """
        Extract paragraph text using paragraph-level bounding box.
        
        This preserves Google Vision API's word grouping (e.g., "炊飯器" stays as one word)
        instead of splitting into individual characters like word-level extraction does.
        
        Args:
            paragraph: Vision API paragraph object
            
        Returns:
            Tuple of (list with single paragraph text, list with single bounding box dictionary)
        """
        # Skip if no bounding box
        if not paragraph.bounding_box or not paragraph.bounding_box.vertices:
            return [], []
        
        vertices = paragraph.bounding_box.vertices
        if len(vertices) < 3:
            return [], []
        
        # Extract paragraph text by concatenating all words (preserves Google's word grouping)
        paragraph_text_parts = []
        for word in paragraph.words:
            base_text = "".join(symbol.text for symbol in word.symbols)
            if base_text.strip():
                paragraph_text_parts.append(base_text)
        
        paragraph_text = "".join(paragraph_text_parts)
        if not paragraph_text.strip():
            return [], []
        
        # Debug: Show what paragraph text we extracted
        safe_text = safe_decode(paragraph_text)
        debug_msg = f'[DEBUG] Extracted paragraph text: {repr(safe_text)}\n'
        print(debug_msg, end='', file=sys.stdout)
        
        # Use paragraph-level bounding box
        x_coords = [v.x for v in vertices]
        y_coords = [v.y for v in vertices]
        
        paragraph_bboxes = [
            {
                "text": paragraph_text,
                "x_min": min(x_coords),
                "y_min": min(y_coords),
                "x_max": max(x_coords),
                "y_max": max(y_coords),
            }
        ]
        
        return [paragraph_text], paragraph_bboxes



    def _extract_words_from_paragraph(self, paragraph) -> tuple[list[str], list[dict]]:
        return self._extract_paragraph_text_with_bbox(paragraph)
        

    def _sort_vertical_text(self, paragraph_words: list[str], paragraph_bboxes: list[dict]) -> tuple[list[str], list[dict]]:
        """
        Sort words in reading order for vertical text (top-to-bottom, right-to-left).
        
        Japanese vertical text reads from rightmost column to leftmost column.
        
        Args:
            paragraph_words: List of word texts
            paragraph_bboxes: List of bounding box dictionaries
            
        Returns:
            Tuple of (sorted words, sorted bounding boxes)
        """
        if len(paragraph_bboxes) <= 1:
            return paragraph_words, paragraph_bboxes

        # Calculate center points of each word's bounding box for sorting
        for bbox in paragraph_bboxes:
            bbox["center_x"] = (bbox["x_min"] + bbox["x_max"]) / 2
            bbox["center_y"] = (bbox["y_min"] + bbox["y_max"]) / 2

        # Detect if this paragraph has multiple columns (common in Japanese books)
        # If words span horizontally more than twice their average width, it's multi-column
        x_coords = [bbox["center_x"] for bbox in paragraph_bboxes]
        x_range = max(x_coords) - min(x_coords) if x_coords else 0
        avg_width = (
            sum(bbox["x_max"] - bbox["x_min"] for bbox in paragraph_bboxes) / len(paragraph_bboxes)
            if paragraph_bboxes
            else 0
        )
        has_multiple_columns = x_range > avg_width * 2 if avg_width else False

        # Sort words for correct reading order
        if has_multiple_columns:
            # Multi-column: sort by rightmost column first (descending X), then top-to-bottom (ascending Y)
            sorted_indices = sorted(
                range(len(paragraph_bboxes)),
                key=lambda i: (
                    -paragraph_bboxes[i]["center_x"],  # Rightmost columns first
                    paragraph_bboxes[i]["center_y"],   # Then top-to-bottom
                ),
            )
        else:
            # Single column: just sort top-to-bottom
            sorted_indices = sorted(
                range(len(paragraph_bboxes)),
                key=lambda i: paragraph_bboxes[i]["center_y"],
            )

        # Reorder words and bounding boxes according to reading order
        sorted_words = [paragraph_words[i] for i in sorted_indices]
        sorted_bboxes = [paragraph_bboxes[i] for i in sorted_indices]
        
        return sorted_words, sorted_bboxes

    def _render_text_to_pdf(self, output_page, paragraph_bboxes: list[dict], is_vertical: bool, scale_x: float, scale_y: float) -> None:
        """
        Render text onto the PDF page at correct positions.
        
        Args:
            output_page: PyMuPDF page object to render to
            paragraph_bboxes: List of bounding box dictionaries with text
            is_vertical: Whether the text is vertical
            scale_x: Scaling factor for X coordinates (PDF points / image pixels)
            scale_y: Scaling factor for Y coordinates (PDF points / image pixels)
        """
        for bbox_info in paragraph_bboxes:
            # Convert image pixel coordinates to PDF point coordinates
            pdf_x = bbox_info["x_min"] * scale_x
            pdf_y = bbox_info["y_min"] * scale_y
            pdf_width = (bbox_info["x_max"] - bbox_info["x_min"]) * scale_x
            pdf_height = (bbox_info["y_max"] - bbox_info["y_min"]) * scale_y
            text = bbox_info["text"]
            if not text.strip():
                continue
            
            # Debug: Show what text is being applied to the PDF
            print(f'applying {repr(safe_decode(text))} to pdf\n', end='', file=sys.stdout)
            
            # Calculate font size based on the height of the bounding box
            # Clamp between 6 and 18 points for readability
            font_size = max(min(pdf_height, 18), 6)
            
            # Create a rectangle on the PDF where we'll place the text
            text_rect = fitz.Rect(pdf_x, pdf_y, pdf_x + pdf_width, pdf_y + pdf_height)
            
            # Create HTML span with appropriate styling
            if is_vertical:
                # Vertical text: use CSS vertical-rl (right-to-left) with upright orientation
                html_word = (
                    f'<span style="font-size:{font_size}px; color:#ffffff; '
                    'writing-mode: vertical-rl; text-orientation: upright;">'
                    f'{text}</span>'
                )
            else:
                # Horizontal text: standard left-to-right
                html_word = f'<span style="font-size:{font_size}px; color:#ffffff;">{text}</span>'
            
            # Insert the text as an invisible overlay (white text on white background)
            # This makes the text selectable/searchable without changing the visual appearance
            output_page.insert_htmlbox(text_rect, html_word)

    def _apply_ocr_response_to_page(
        self,
        output_page,
        response,
        page_width: float,
        page_height: float,
        img_width: int,
        img_height: int,
    ) -> None:
        """
        Apply OCR text from Vision API response to a PDF page.
        
        This method handles the text application logic independently of API calls,
        making it testable without mocking the Vision API.
        
        Args:
            output_page: PyMuPDF page object to apply text to
            response: Vision API AnnotateImageResponse object
            page_width: Width of the PDF page in points
            page_height: Height of the PDF page in points
            img_width: Width of the source image in pixels
            img_height: Height of the source image in pixels
        """
        # Check if the Vision API returned an error
        if response.error.code != 0:
            raise Exception(f"Error in OCR: {response.error.message}")

        # Process the structured OCR response from Google Vision API
        # Structure: pages -> blocks -> paragraphs -> words -> symbols
        # This is the "happy path" - document_text_detection always returns full_text_annotation
        if response.full_text_annotation:
            full_text = response.full_text_annotation
            
            # Calculate scaling factors to convert from image pixel coordinates to PDF point coordinates
            # PDF pages are measured in points (1/72 inch), images are in pixels
            scale_x = page_width / img_width
            scale_y = page_height / img_height

            # Iterate through the hierarchical structure Google Vision API provides
            for vpage in full_text.pages:
                for block in vpage.blocks:
                    for paragraph in block.paragraphs:
                        # Detect if this paragraph contains vertical text (common in Japanese)
                        is_vertical = self._is_vertical_text(paragraph)

                        # Extract words and bounding boxes from the paragraph
                        # NOTE: Currently using paragraph-level extraction (preserves word grouping like "炊飯器")
                        # To switch to word-level extraction (splits words), modify _extract_words_from_paragraph method
                        paragraph_words, paragraph_bboxes = self._extract_words_from_paragraph(paragraph)

                        # For vertical text, sort words in reading order (top-to-bottom, right-to-left)
                        # NOTE: With paragraph-level extraction, this is a no-op (one bbox per paragraph)
                        # Horizontal text doesn't need sorting - Google Vision API returns it in correct left-to-right order
                        if is_vertical:
                            paragraph_words, paragraph_bboxes = self._sort_vertical_text(paragraph_words, paragraph_bboxes)

                        # Merge adjacent kanji characters that were incorrectly split by OCR
                        # Render text onto the PDF page
                        self._render_text_to_pdf(output_page, paragraph_bboxes, is_vertical, scale_x, scale_y)
        


    def process_pdf(self, pdf_bytes: bytes, progress_callback=None) -> bytes:
        if not pdf_bytes:
            raise ValueError("PDF bytes cannot be empty")

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = doc.page_count

        try:
            output_doc = fitz.open()

            for page_num in range(total_pages):
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
                response = self.client.document_text_detection(image=image)

                # Apply OCR text to page using extracted method
                self._apply_ocr_response_to_page(
                    output_page,
                    response,
                    page_width,
                    page_height,
                    img_width,
                    img_height
                )

                output_page.insert_image(img_rect, stream=img_bytes)

            output_bytes = BytesIO()
            output_doc.save(output_bytes, garbage=4, deflate=True, clean=True)
            output_doc.close()

            result_bytes = output_bytes.getvalue()
            logger.info(f"OCR PDF created: {len(result_bytes)} bytes ({len(result_bytes) / (1024*1024):.2f} MB)")
            return result_bytes

        finally:
            doc.close()

