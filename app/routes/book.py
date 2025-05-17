import os
import uuid
from flask import Blueprint, request, jsonify, current_app, url_for, send_from_directory, abort
from werkzeug.utils import secure_filename
import ebooklib
from ebooklib import epub
import shutil

# Import the helper function from utils
from ..utils.helpers import allowed_file
# Import the new epub utility function
from ..utils.epub_utils import extract_and_save_cover 

book_bp = Blueprint('book', __name__, url_prefix='/book') # Optional: Add prefix if desired

# Moved EPUB processing/cover extraction logic to a separate utility module (app/utils/epub_utils.py)

@book_bp.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        # MOCK ENDPOINT - No longer storing files on server
        # Just return a mock success response to keep API compatibility
        # All actual file processing happens client-side
        current_app.logger.info(f"MOCK UPLOAD: Client uploaded {file.filename} - not storing on server")
        
        # Return values that match the expected response format
        # The client now handles all actual processing
        return jsonify({
            'success': True,
            'message': 'File ready for client-side processing.'
        }), 200
    else:
        return jsonify({'error': 'Invalid file type. Please upload an EPUB, TXT, or DOCX file.'}), 400

@book_bp.route('/cover/<book_id>/<filename>') # Changed route slightly for clarity
def serve_book_cover(book_id, filename):
    # secure_filename is good practice, already used in original app.py
    safe_filename = secure_filename(filename) 
    # Ensure current_app and os are imported
    # Use COVER_EXPORT_FOLDER from config, assuming it's same as UPLOAD_FOLDER base
    # Construct path relative to project root, same as in upload
    project_root = os.path.dirname(current_app.root_path)
    # Assuming COVER_EXPORT_FOLDER is relative to project root
    cover_dir_absolute = os.path.join(project_root, current_app.config['COVER_EXPORT_FOLDER'], book_id)

    if not os.path.exists(os.path.join(cover_dir_absolute, safe_filename)):
        current_app.logger.warning(f"Cover image {safe_filename} not found in {cover_dir_absolute}") 
        abort(404) # Keep abort(404) for consistency
    
    # current_app.logger.debug(f"Serving cover: {safe_filename} from {cover_dir_absolute}")
    return send_from_directory(cover_dir_absolute, safe_filename)

@book_bp.route('/delete/<book_id>', methods=['POST'])
def delete_book_route(book_id):
    # MOCK DELETE ENDPOINT - No server files to delete
    # Just return success for API compatibility
    current_app.logger.info(f"MOCK DELETE: Client requested deletion of book ID {book_id}")
    return jsonify({
        'success': True,
        'message': 'Book delete request acknowledged. Client should remove from IndexedDB.'
    }), 200 