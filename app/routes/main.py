"""Blueprint routes for main pages and index handling."""
from flask import Blueprint, render_template, session, request, redirect, url_for, current_app, jsonify
import os
import uuid

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    """Return the index page; JavaScript fills in the book list."""
    return render_template('index.html', books=[])

@main_bp.route('/upload', methods=['POST'])
def upload_file():
    """Validate the uploaded file and return a JSON status message."""
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'}), 400
    
    if file and file.filename.lower().endswith(('.epub', '.txt', '.docx', '.pdf', '.mobi')):
        # File storage happens in the browser; this endpoint only confirms the upload
        current_app.logger.info(f"MOCK UPLOAD in main.py: Client sent '{file.filename}' - directing to client processing")
        return jsonify({'success': True, 'message': 'File ready for client-side processing.'})
    else:
        return jsonify({'success': False, 'message': 'Invalid file type, please upload an EPUB, PDF, MOBI, DOCX, or TXT file.'}), 400


@main_bp.route('/delete/<filename>', methods=['POST'])
def delete_book(filename):
    """Return an error because deletion happens in the browser."""
    return jsonify({'success': False, 'message': 'Deletion handled client-side via IndexedDB.'}), 400


@main_bp.route('/demo', strict_slashes=False)
def demo():
    """Render the demo page by including index.html"""
    demo_books_dir = os.path.join(current_app.root_path, 'static', 'demo_books')
    demo_book_files = []
    if os.path.exists(demo_books_dir):
        demo_book_files = [f for f in os.listdir(demo_books_dir) if f.endswith('.epub')]
        current_app.logger.debug(f"Found demo books: {demo_book_files}")

    return render_template('demo.html', is_demo=True, demo_books=demo_book_files, openai_key_configured=True) 
@main_bp.route('/tos')
def tos():
    """Render the Terms of Service page."""
    return render_template('tos.html')

