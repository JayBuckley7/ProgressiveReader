"""OCR service for processing PDFs with Google Cloud Vision API."""
from __future__ import annotations

import os
import logging
from io import BytesIO

try:
    from google.cloud import vision
except ImportError:
    vision = None

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

logger = logging.getLogger(__name__)


class OCRService:
    """Service for processing PDFs with OCR."""

    def __init__(self):
        """Initialize OCR service with Vision API client."""
        if vision is None:
            raise ImportError("google-cloud-vision is not installed")
        if fitz is None:
            raise ImportError("PyMuPDF is not installed")
        
        # Initialize Vision API client
        # Will use Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS env var
        try:
            self.client = vision.ImageAnnotatorClient()
        except Exception as e:
            logger.error(f"Failed to initialize Vision API client: {e}")
            raise

    def _find_windows_cjk_font(self) -> str:
        """Find Windows CJK font for rendering."""
        fonts_dir = os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts")
        # Try registry for most reliable mapping
        try:
            import winreg  # type: ignore
            reg_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_path)
            num_vals = winreg.QueryInfoKey(key)[1]
            preferred_names = [
                "Yu Gothic UI",
                "Yu Gothic",
                "Meiryo",
                "MS Gothic",
                "MS Mincho",
                "MS PGothic",
                "MS PMincho",
            ]
            found = {}
            for i in range(num_vals):
                try:
                    name, value, _ = winreg.EnumValue(key, i)
                except OSError:
                    continue
                for pref in preferred_names:
                    if pref.lower() in name.lower():
                        font_file = value
                        if not os.path.isabs(font_file):
                            font_file = os.path.join(fonts_dir, font_file)
                        if os.path.exists(font_file):
                            found[pref] = font_file
            for pref in preferred_names:
                if pref in found:
                    return found[pref]
        except Exception:
            pass
        # Fallback: common filenames
        fallback_files = [
            "YuGothR.ttc",
            "YuGothB.ttc",
            "meiryo.ttc",
            "msgothic.ttc",
            "msmincho.ttc",
            "meiryob.ttc",
        ]
        for fn in fallback_files:
            p = os.path.join(fonts_dir, fn)
            if os.path.exists(p):
                return p
        return ""

    def process_pdf(self, pdf_bytes: bytes, progress_callback=None) -> bytes:
        """
        Process PDF with OCR and return OCR'd PDF as bytes.
        
        Args:
            pdf_bytes: Original PDF file content as bytes
            progress_callback: Optional callback function(page_num, total_pages) for progress updates
            
        Returns:
            OCR'd PDF file content as bytes
            
        Raises:
            Exception: If OCR processing fails
        """
        if not pdf_bytes:
            raise ValueError("PDF bytes cannot be empty")

        # Open PDF from bytes
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = doc.page_count
        
        try:
            # Create a new PDF for the OCR output
            output_doc = fitz.open()

            # Iterate through each page in the PDF
            for page_num in range(doc.page_count):
                # Report progress if callback provided
                if progress_callback:
                    progress_callback(page_num + 1, total_pages)
                
                page = doc.load_page(page_num)
                pix = page.get_pixmap()
                
                # Get page dimensions
                page_width = page.rect.width
                page_height = page.rect.height
                img_width = pix.width
                img_height = pix.height
                
                # Create a new page in the output PDF with same dimensions
                output_page = output_doc.new_page(width=page_width, height=page_height)
                
                # Convert pixmap to image bytes for OCR and later insertion
                img_bytes = pix.tobytes("png")
                img_rect = fitz.Rect(0, 0, page_width, page_height)
                
                # Create an image object from the pixmap for OCR
                image = vision.Image(content=img_bytes)

                # Perform OCR on the image using Google Cloud Vision API
                # Use document_text_detection for better bounding boxes (word-level)
                response = self.client.document_text_detection(image=image)

                # Check if the response contains an error
                if response.error.code != 0:
                    raise Exception(f"Error in OCR: {response.error.message}")

                # Find CJK font (though HTML insertion handles Unicode without manual font registration)
                cjk_font_path = ""
                if os.name == "nt":
                    cjk_font_path = self._find_windows_cjk_font()
                # Allow drop-in local font as last resort
                if not cjk_font_path:
                    for local in ("NotoSansCJKjp-Regular.otf", "NotoSerifCJKjp-Regular.otf"):
                        p = os.path.join(os.getcwd(), local)
                        if os.path.exists(p):
                            cjk_font_path = p
                            break

                # Check if we have full text annotation (document_text_detection structure)
                if response.full_text_annotation:
                    # Use document_text_detection results (better for documents)
                    full_text = response.full_text_annotation
                    
                    # Scale coordinates from image space to PDF space
                    scale_x = page_width / img_width
                    scale_y = page_height / img_height
                    
                    # Process each page (usually just one)
                    for vpage in full_text.pages:
                        for block in vpage.blocks:
                            for paragraph in block.paragraphs:
                                # Insert each word in its own bounding box
                                for word in paragraph.words:
                                    if not word.bounding_box or not word.bounding_box.vertices:
                                        continue
                                    w_vertices = word.bounding_box.vertices
                                    if len(w_vertices) < 3:
                                        continue
                                    x_coords = [v.x for v in w_vertices]
                                    y_coords = [v.y for v in w_vertices]
                                    x_min = min(x_coords)
                                    y_min = min(y_coords)
                                    x_max = max(x_coords)
                                    y_max = max(y_coords)
                                    pdf_x = x_min * scale_x
                                    pdf_y = y_min * scale_y
                                    pdf_width = (x_max - x_min) * scale_x
                                    pdf_height = (y_max - y_min) * scale_y
                                    text = ''.join([symbol.text for symbol in word.symbols])
                                    if not text.strip():
                                        continue
                                    font_size = max(min(pdf_height, 18), 6)
                                    text_rect = fitz.Rect(pdf_x, pdf_y, pdf_x + pdf_width, pdf_y + pdf_height)
                                    # Insert as HTML in the word rectangle; will be covered by image later
                                    html_word = f'<span style="font-size:{font_size}px; color:#ffffff;">{text}</span>'
                                    output_page.insert_htmlbox(text_rect, html_word)
                
                # Fallback to text_detection if document_text_detection didn't work
                elif response.text_annotations:
                    # Scale coordinates from image space to PDF space
                    scale_x = page_width / img_width
                    scale_y = page_height / img_height
                    
                    # Skip the first annotation (it's the full text description)
                    for annotation in response.text_annotations[1:]:
                        if not annotation.bounding_poly or not annotation.bounding_poly.vertices:
                            continue
                        
                        vertices = annotation.bounding_poly.vertices
                        if len(vertices) < 3:
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
                        
                        text = annotation.description
                        if not text.strip():
                            continue
                        
                        font_size = max(min(pdf_height, 18), 6)
                        text_rect = fitz.Rect(pdf_x, pdf_y, pdf_x + pdf_width, pdf_y + pdf_height)
                        html_word = f'<span style="font-size:{font_size}px; color:#ffffff;">{text}</span>'
                        output_page.insert_htmlbox(text_rect, html_word)

                # Finally, put the page image on top so the text is invisible but selectable
                output_page.insert_image(img_rect, stream=img_bytes)

            # Save to bytes with compression
            output_bytes = BytesIO()
            # Enable compression to prevent huge file sizes
            output_doc.save(
                output_bytes,
                garbage=4,  # Aggressive garbage collection
                deflate=True,  # Enable deflate compression
                clean=True  # Clean up unused objects
            )
            output_doc.close()
            
            result_bytes = output_bytes.getvalue()
            logger.info(f"OCR PDF created: {len(result_bytes)} bytes ({len(result_bytes) / (1024*1024):.2f} MB)")
            return result_bytes
            
        finally:
            # Close the input PDF document
            doc.close()

