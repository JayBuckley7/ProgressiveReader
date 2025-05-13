from flask import Blueprint, render_template, session, request, redirect, url_for, current_app, jsonify
import os
import uuid
# import tempfile # No longer needed

# Use a more descriptive name like 'main_bp' or similar
main_bp = Blueprint('main', __name__)

# Helper to clean up old temp file path from session (kept here for now as it relates to index)
# Re-evaluated cleanup function and removed it as obsolete for persistent storage.
# def cleanup_temp_file(path_key='temp_epub_path'):
#     old_temp_path = session.pop(path_key, None)

@main_bp.route('/')
def index():
    # cleanup_temp_file() # Decide if this cleanup logic is still needed at the index -> Removing call
    # This will be replaced by client-side IndexedDB logic
    # books_dir = current_app.config['USER_EPUB_DIR']
    # books = []
    # if os.path.exists(books_dir):
    #     for f in os.listdir(books_dir):
    #         if f.endswith('.epub'):
    #             # try to get title and author from filename
    #             parts = os.path.splitext(f)[0].split(' - ')
    #             title = parts[0]
    #             author = parts[1] if len(parts) > 1 else 'Unknown Author'
    #             books.append({'filename': f, 'title': title, 'author': author, 'id': f}) # Using filename as id for now
    # books.sort(key=lambda b: b['title']) # Sort by title
    return render_template('index.html', books=[]) # Pass an empty list, JS will populate

@main_bp.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No selected file'}), 400
    
    if file and file.filename.endswith('.epub'):
        # No longer saving the file to the server.
        # The client will handle storage in IndexedDB.
        # filename = str(uuid.uuid4()) + ".epub" # Generate a unique filename
        # file_path = os.path.join(current_app.config['USER_EPUB_DIR'], filename)
        # file.save(file_path)
        # print(f"File saved to {file_path}")
        return jsonify({'success': True, 'message': 'File ready for client-side processing.'})
    else:
        return jsonify({'success': False, 'message': 'Invalid file type, please upload an EPUB.'}), 400

# Route removed as reading is handled by /read/<book_id>/<item_index> in reader.py
# @main_bp.route('/read/<int:bookId>')
# def read_book(bookId):
    # No longer looks for a file on the server.
    # Just renders the template and passes the bookId.
    # JavaScript will use bookId to fetch content from IndexedDB.
    # openai_key_configured = bool(current_app.config.get('OPENAI_API_KEY'))
    # model_name = current_app.config.get('DEFAULT_MODEL', '')
    # current_index = 0  # Default to first page/item
    # total_items = 0    # Default, JS will update this based on IndexedDB content
    # toc = []           # Default to empty TOC, JS might populate this
    # Assuming content is primarily loaded by JS, but provide a safe default
    # content = ""       
    # jlpt_enabled = current_app.config.get('JLPT_ENABLED_BY_DEFAULT', False)

    # return render_template('reader.html', 
                           # book_id=bookId, 
                           # openai_key_configured=openai_key_configured,
                           # model_name=model_name,
                           # current_index=current_index,
                           # total_items=total_items,
                           # toc=toc,
                           # content=content,
                           # jlpt_enabled=jlpt_enabled)

@main_bp.route('/delete/<filename>', methods=['POST'])
def delete_book(filename):
    # This endpoint is deprecated as deletion is handled client-side.
    # Keeping it might be useful for future API calls, but returning error for now.
    return jsonify({'success': False, 'message': 'Deletion handled client-side via IndexedDB.'}), 400

# Remove old /book/cover route if it exists, as covers aren't handled yet
# @main_bp.route('/book/cover/<book_id>/<filename>')
# def book_cover(book_id, filename):
#    ... (old cover serving logic) 