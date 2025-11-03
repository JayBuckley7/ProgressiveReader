"""OCR domain routes."""
from flask import Blueprint, request, send_file, jsonify, current_app, Response
from io import BytesIO
import logging
import json
import base64
import queue
import threading
import time

from ...utils.clerk_auth import optional_auth
from .service import OCRService

logger = logging.getLogger(__name__)

ocr_bp = Blueprint('ocr', __name__, url_prefix='/api/ocr')

# Initialize service - store error for better error messages
init_error = None
try:
    ocr_service = OCRService()
except Exception as e:
    logger.error(f"Failed to initialize OCR service: {e}", exc_info=True)
    ocr_service = None
    init_error = str(e)


def _generate_ocr_with_progress(pdf_bytes, filename):
    """Generator function that yields progress updates and final PDF."""
    progress_queue = queue.Queue()
    result_queue = queue.Queue()
    pdf_sent = False  # Guard to prevent sending PDF multiple times
    
    def collect_progress(page_num, total_pages):
        """Progress callback that puts updates in the queue."""
        progress_data = {
            'type': 'progress',
            'page': page_num,
            'total': total_pages,
            'percent': int((page_num / total_pages) * 100)
        }
        progress_queue.put(progress_data)
    
    def process_in_thread():
        """Process OCR in a separate thread."""
        try:
            ocr_pdf_bytes = ocr_service.process_pdf(pdf_bytes, progress_callback=collect_progress)
            result_queue.put(('success', ocr_pdf_bytes))
        except Exception as e:
            logger.error(f"OCR processing error in thread: {e}", exc_info=True)
            result_queue.put(('error', str(e)))
    
    # Start OCR processing in a background thread
    thread = threading.Thread(target=process_in_thread)
    thread.daemon = True
    thread.start()
    
    # Yield progress updates as they arrive
    while True:
        try:
            # Check for progress updates (non-blocking)
            try:
                progress_update = progress_queue.get_nowait()
                yield f"data: {json.dumps(progress_update)}\n\n"
            except queue.Empty:
                pass
            
            # Check if processing is complete (only if PDF not already sent)
            if not pdf_sent:
                try:
                    status, result = result_queue.get_nowait()
                    if status == 'success':
                        pdf_sent = True  # Mark as sent to prevent duplicates
                        # Send completion WITHOUT PDF (too large for base64 in SSE)
                        completion_data = {
                            'type': 'complete',
                            'filename': filename,
                            'size': len(result)
                        }
                        yield f"data: {json.dumps(completion_data)}\n\n"
                        # Now stream PDF as binary chunks
                        logger.info(f"Starting to stream PDF: {len(result)} bytes in chunks")
                        chunk_size = 8192  # 8KB chunks
                        chunks_sent = 0
                        total_bytes_sent = 0
                        for i in range(0, len(result), chunk_size):
                            chunk = result[i:i + chunk_size]
                            yield chunk
                            chunks_sent += 1
                            total_bytes_sent += len(chunk)
                            if chunks_sent % 1000 == 0:  # Log every ~8MB
                                logger.info(f"Sent {chunks_sent} chunks ({total_bytes_sent} bytes / {len(result)} bytes)")
                        logger.info(f"Finished streaming PDF: {chunks_sent} chunks, {total_bytes_sent} bytes sent (expected {len(result)} bytes)")
                        # CRITICAL: Break immediately after sending PDF
                        return  # Use return instead of break to ensure generator stops
                    else:
                        # Error occurred
                        error_data = {
                            'type': 'error',
                            'error': result
                        }
                        yield f"data: {json.dumps(error_data)}\n\n"
                        break
                except queue.Empty:
                    pass
            
            # Check if thread is still alive (only if PDF not already sent)
            if not pdf_sent and not thread.is_alive():
                # Thread finished, check for final result
                try:
                    status, result = result_queue.get_nowait()
                    if status == 'success':
                        pdf_sent = True  # Mark as sent to prevent duplicates
                        # Send completion WITHOUT PDF (too large for base64 in SSE)
                        completion_data = {
                            'type': 'complete',
                            'filename': filename,
                            'size': len(result)
                        }
                        yield f"data: {json.dumps(completion_data)}\n\n"
                        # Stream PDF as binary chunks
                        logger.info(f"Thread finished - streaming PDF: {len(result)} bytes in chunks")
                        chunk_size = 8192  # 8KB chunks
                        chunks_sent = 0
                        total_bytes_sent = 0
                        for i in range(0, len(result), chunk_size):
                            chunk = result[i:i + chunk_size]
                            yield chunk
                            chunks_sent += 1
                            total_bytes_sent += len(chunk)
                            if chunks_sent % 1000 == 0:  # Log every ~8MB
                                logger.info(f"Sent {chunks_sent} chunks ({total_bytes_sent} bytes / {len(result)} bytes)")
                        logger.info(f"Finished streaming PDF: {chunks_sent} chunks, {total_bytes_sent} bytes sent (expected {len(result)} bytes)")
                        # CRITICAL: Return immediately after sending PDF
                        return  # Use return instead of break to ensure generator stops
                    else:
                        error_data = {
                            'type': 'error',
                            'error': result
                        }
                        yield f"data: {json.dumps(error_data)}\n\n"
                        break
                except queue.Empty:
                    # No result found, likely an error occurred
                    error_data = {
                        'type': 'error',
                        'error': 'OCR processing failed unexpectedly'
                    }
                    yield f"data: {json.dumps(error_data)}\n\n"
                    break
            
            # If PDF already sent, we're done
            if pdf_sent:
                break
            
            # Small sleep to avoid busy-waiting
            time.sleep(0.1)
            
        except Exception as e:
            logger.error(f"Error in progress generator: {e}", exc_info=True)
            error_data = {
                'type': 'error',
                'error': str(e)
            }
            yield f"data: {json.dumps(error_data)}\n\n"
            break


@ocr_bp.route('/process', methods=['POST'])
@optional_auth
def process_ocr():
    """
    Process PDF with OCR and return OCR'd PDF with progress updates.
    
    Expects multipart/form-data with 'pdf' file field.
    Returns Server-Sent Events (SSE) stream with progress updates, then final PDF.
    """
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
            _generate_ocr_with_progress(pdf_bytes, pdf_file.filename),
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

