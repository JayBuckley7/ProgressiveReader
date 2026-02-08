"""OCR domain routes."""
from flask import Blueprint, request, jsonify, current_app, Response
import logging

from ...utils.clerk_auth import optional_auth

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
    ocr_service = getattr(container, "ocr_service", None)
    init_error = getattr(container, "ocr_init_error", None)

    if ocr_service is None:
        error_msg = 'OCR service not available.'
        if init_error:
            error_msg += f' Error: {init_error}'
        else:
            error_msg += ' Please ensure google-cloud-vision and PyMuPDF are installed, and Google Cloud credentials are configured.'
        return jsonify({'error': error_msg}), 500

    if 'pdf' not in request.files:
        return jsonify({'error': 'No PDF file provided'}), 400

    pdf_file = request.files['pdf']
    
    if pdf_file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # Check file extension
    if not pdf_file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400

    try:
        # Read PDF bytes
        pdf_bytes = pdf_file.read()
        
        if not pdf_bytes:
            return jsonify({'error': 'PDF file is empty'}), 400

        current_app.logger.info(f"Processing PDF with OCR: {pdf_file.filename}")
        
        # Return streaming response with progress updates
        # Note: Starts as text/event-stream for SSE, then switches to binary for PDF
        return Response(
            ocr_service.stream_process_pdf(pdf_bytes, filename=pdf_file.filename),
            mimetype='application/octet-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Content-Type': 'application/octet-stream'
            }
        )
        
    except ValueError as e:
        logger.error(f"Invalid PDF error: {e}")
        return jsonify({'error': f'Invalid PDF: {str(e)}'}), 400
    except Exception as e:
        logger.error(f"OCR processing error: {e}", exc_info=True)
        return jsonify({'error': f'OCR processing failed: {str(e)}'}), 500
