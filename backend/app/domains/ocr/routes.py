"""OCR domain routes."""
from flask import Blueprint, request, jsonify, current_app, Response
import logging

from ...utils.clerk_auth import optional_auth
from .controller import OcrController
from .errors import OcrUnavailableError, InvalidOcrUploadError
from .layout_controller import OcrLayoutController

logger = logging.getLogger(__name__)

ocr_bp = Blueprint('ocr', __name__, url_prefix='/api/ocr')


@ocr_bp.route('/process', methods=['POST'])
@optional_auth
def process_ocr():
    """
    Process PDF with OCR and return OCR'd PDF with progress updates.
    
    Expects multipart/form-data with 'pdf' file field.
    Returns Server-Sent Events (SSE) stream with progress updates, then final PDF.
    """
    container = current_app.extensions["container"]
    controller = OcrController(
        ocr_service=getattr(container, "ocr_service", None),
        init_error=getattr(container, "ocr_init_error", None),
    )

    try:
        stream, filename = controller.stream_from_upload(pdf_file=request.files.get("pdf"))
        current_app.logger.info(f"Processing PDF with OCR: {filename}")

        # Return streaming response with progress updates.
        # Note: Starts as SSE-like `data:` messages, then switches to binary for PDF bytes.
        return Response(
            stream,
            mimetype="application/octet-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Content-Type": "application/octet-stream",
            },
        )
    except OcrUnavailableError as e:
        return jsonify({"error": str(e)}), 500
    except InvalidOcrUploadError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"OCR processing error: {e}", exc_info=True)
        return jsonify({"error": f"OCR processing failed: {str(e)}"}), 500


@ocr_bp.route('/layout/page', methods=['POST'])
@optional_auth
def process_ocr_page_layout():
    """Extract normalized OCR layout for a rendered page image."""
    container = current_app.extensions["container"]
    controller = OcrLayoutController(
        service=getattr(container, "ocr_layout_service", None),
        init_error=getattr(container, "ocr_init_error", None),
    )

    try:
        ocr_profile = str(request.form.get("ocr_profile") or "ja-pdf-overlay-v1")
        page_index = int(request.form.get("page_index") or 0)
        document_id = request.form.get("document_id")
        document_version = request.form.get("document_version")
        payload = controller.extract_from_upload(
            image_file=request.files.get("image"),
            ocr_profile=ocr_profile,
            page_index=page_index,
            document_id=document_id,
            document_version=document_version,
        )
        return jsonify(payload)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except OcrUnavailableError as e:
        return jsonify({"error": str(e)}), 500
    except InvalidOcrUploadError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"OCR page layout error: {e}", exc_info=True)
        return jsonify({"error": f"OCR page layout failed: {str(e)}"}), 500
