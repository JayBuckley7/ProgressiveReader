"""Blueprint routes for handling book uploads and retrieval."""
import os
import uuid
from flask import Blueprint, request, jsonify, current_app, url_for, send_from_directory, abort
from werkzeug.utils import secure_filename
import ebooklib
from ebooklib import epub
import shutil

# Import the helper function from utils
from ..utils.helpers import allowed_file
book_bp = Blueprint('book', __name__, url_prefix='/book')

@book_bp.route('/upload', methods=['POST'])
def upload_file():
    """Validate a book upload and return a JSON result."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        # Upload endpoint stub; file is processed in the browser
        current_app.logger.info(
            f"MOCK UPLOAD: Client uploaded {file.filename} - not storing on server"
        )

        return jsonify({
            'success': True,
            'message': 'File ready for client-side processing.'
        }), 200
    else:
        return jsonify({'error': 'Invalid file type. Please upload an EPUB, PDF, MOBI, DOCX, or TXT file.'}), 400

@book_bp.route('/cover/<book_id>/<filename>')
def serve_book_cover(book_id, filename):
    """Serve a stored cover image for a specific book."""
    safe_filename = secure_filename(filename)
    project_root = os.path.dirname(current_app.root_path)
    cover_dir_absolute = os.path.join(project_root, current_app.config['COVER_EXPORT_FOLDER'], book_id)

    if not os.path.exists(os.path.join(cover_dir_absolute, safe_filename)):
        current_app.logger.warning(
            f"Cover image {safe_filename} not found in {cover_dir_absolute}"
        )
        abort(404)

    return send_from_directory(cover_dir_absolute, safe_filename)

@book_bp.route('/delete/<book_id>', methods=['POST'])
def delete_book_route(book_id):
    """Acknowledge a delete request; no server files are removed."""
    # Mock delete endpoint for API compatibility
    current_app.logger.info(f"MOCK DELETE: Client requested deletion of book ID {book_id}")
    return jsonify({
        'success': True,
        'message': 'Book delete request acknowledged. Client should remove from IndexedDB.'
    }), 200 
