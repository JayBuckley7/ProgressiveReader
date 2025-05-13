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
        book_id = str(uuid.uuid4())
        # Ensure UPLOAD_FOLDER path is constructed correctly (relative to project root)
        project_root = os.path.dirname(current_app.root_path)
        upload_folder_abs = os.path.join(project_root, current_app.config['UPLOAD_FOLDER'])
        book_folder = os.path.join(upload_folder_abs, book_id)
        book_file_path = os.path.join(book_folder, 'book.epub')
        cover_image_filename = None
        title = "Untitled Book" # Default title

        try:
            if not os.path.exists(book_folder):
                os.makedirs(book_folder)
            
            file.save(book_file_path)
            current_app.logger.info(f"Saved EPUB file to: {book_file_path}")

            # Get Title (Keep this simple part here, or move if desired)
            try:
                book = epub.read_epub(book_file_path)
                title_meta = book.get_metadata('DC', 'title')
                if title_meta:
                    title = title_meta[0][0]
            except Exception as title_e:
                 current_app.logger.warning(f"Could not read title metadata from {book_file_path}: {title_e}")
                 # Keep default title

            # --- Call utility function for Cover extraction --- 
            cover_image_filename = extract_and_save_cover(book_file_path, book_folder)
            # --- End cover image extraction call --- 

            current_app.logger.info(f"Persistently stored EPUB: {book_file_path} with ID: {book_id}, Title: {title}, Cover: {cover_image_filename}")
            return jsonify({
                'book_id': book_id, 
                'title': title, 
                'cover_image_filename': cover_image_filename 
            }), 200

        except Exception as e:
            current_app.logger.error(f"Error processing or saving EPUB with ID {book_id}: {e}", exc_info=True)
            # Cleanup partially created folder/files
            if os.path.exists(book_file_path):
                try: os.remove(book_file_path) 
                except OSError: pass
            if cover_image_filename and os.path.exists(os.path.join(book_folder, cover_image_filename)):
                 try: os.remove(os.path.join(book_folder, cover_image_filename)) 
                 except OSError: pass 
            if os.path.exists(book_folder):
                # Use shutil.rmtree for potentially non-empty folders during cleanup
                try: shutil.rmtree(book_folder) 
                except OSError as rm_err:
                    current_app.logger.error(f"Error cleaning up folder {book_folder} after upload failure: {rm_err}")
                    pass # Log error but continue 
            return jsonify({'error': f'Could not process EPUB file: {str(e)}'}), 500
    else:
        return jsonify({'error': 'Invalid file type. Please upload an EPUB file.'}), 400

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
    # Ensure uuid and shutil are imported
    if not book_id: 
        return jsonify({'success': False, 'error': 'Book ID is required.'}), 400
    
    try:
        uuid.UUID(book_id) # Validate UUID format
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid Book ID format.'}), 400

    # Construct path relative to project root, same as above
    project_root = os.path.dirname(current_app.root_path)
    book_folder_path = os.path.join(project_root, current_app.config['UPLOAD_FOLDER'], book_id)

    if not os.path.exists(book_folder_path) or not os.path.isdir(book_folder_path):
        current_app.logger.info(f"Book folder {book_folder_path} not found. Already considered deleted.") 
        return jsonify({'success': True, 'message': 'Book not found or already deleted.'}), 200

    try:
        shutil.rmtree(book_folder_path)
        current_app.logger.info(f"Successfully deleted book folder: {book_folder_path}") 
        return jsonify({'success': True, 'message': 'Book deleted successfully.'}), 200
    except Exception as e:
        current_app.logger.error(f"Error deleting book folder {book_folder_path}: {e}", exc_info=True) 
        return jsonify({'success': False, 'error': f'Could not delete book: {str(e)}'}), 500 