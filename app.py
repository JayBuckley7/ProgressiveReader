import os
import io
import ebooklib
from ebooklib import epub
from flask import Flask, render_template, request, redirect, url_for, flash, session, abort
import tempfile
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = 'supersecretkey' # MUST have for session, change in production!
ALLOWED_EXTENSIONS = {'epub'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Helper function to extract Toc mapping to spine index
def get_toc_list(book, spine_ids):
    toc_list = []
    spine_file_map = {}
    # Create a map from item file_name (without anchor) to its index in the spine_ids list
    for index, item_id in enumerate(spine_ids):
        item = book.get_item_with_id(item_id)
        if item and item.file_name:
            base_filename = item.file_name.split('#')[0]
            if base_filename not in spine_file_map:
                spine_file_map[base_filename] = index

    # Recursive function to process ToC items (Links and Sections)
    def process_toc_item(item):
        # Handle ebooklib.epub.Link
        if isinstance(item, ebooklib.epub.Link):
            href_filename = item.href.split('#')[0]
            if href_filename in spine_file_map:
                item_index = spine_file_map[href_filename]
                toc_list.append({
                    'title': item.title or "(No Title)", # Use title attribute
                    'index': item_index,
                    'href': item.href
                })
        # Handle ebooklib.epub.Section (which might contain links or subsections)
        elif isinstance(item, ebooklib.epub.Section):
            # Sections themselves might not directly link, but their children do.
            # Optionally add section title if needed, but usually links are sufficient.
            # print(f"Processing Section: {item.title}")
            for child_item in item.children:
                process_toc_item(child_item) # Recurse on children
        # Handle nested Tuples like (Section, [Link, Link, ...])
        elif isinstance(item, tuple) and len(item) > 0:
             # If the first element is Section or Link, process it
             if isinstance(item[0], (ebooklib.epub.Section, ebooklib.epub.Link)):
                 process_toc_item(item[0])
             # If the second element is a list (potential children), process them
             if len(item) > 1 and isinstance(item[1], list):
                 for child_item in item[1]:
                     process_toc_item(child_item)

    # Iterate through the root Table of Contents structure
    for root_item in book.toc:
        process_toc_item(root_item)

    # Remove duplicates based on index, preserving the first occurrence
    seen_indices = set()
    unique_toc = []
    for entry in toc_list:
        if entry['index'] not in seen_indices:
            unique_toc.append(entry)
            seen_indices.add(entry['index'])

    return unique_toc

# Helper to clean up old temp file path from session
def cleanup_temp_file(path_key='temp_epub_path'):
    old_temp_path = session.pop(path_key, None)
    # Also remove associated book data
    session.pop('spine_ids', None)
    session.pop('toc_list', None)
    if old_temp_path and os.path.exists(old_temp_path):
        try:
            os.remove(old_temp_path)
            print(f"Cleaned up temp file: {old_temp_path}")
        except OSError as e:
            print(f"Error deleting old temp file {old_temp_path}: {e}")

@app.route('/')
def index():
    # Cleanup any previous book's temp file when returning to index
    cleanup_temp_file()
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        flash('No file part')
        return redirect(url_for('index'))
    file = request.files['file']
    if file.filename == '':
        flash('No selected file')
        return redirect(url_for('index'))

    if file and allowed_file(file.filename):
        cleanup_temp_file()
        temp_file_path = None
        processing_successful = False
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.epub') as temp_epub:
                file.save(temp_epub)
                temp_file_path = temp_epub.name

            book = epub.read_epub(temp_file_path)

            spine_ids = []
            if book.spine:
                for item_id, _ in book.spine:
                    item = book.get_item_with_id(item_id)
                    if item and item.get_type() == ebooklib.ITEM_DOCUMENT:
                        spine_ids.append(item_id)

            if spine_ids:
                # Get the Table of Contents mapped to spine indices
                toc_list = get_toc_list(book, spine_ids)

                session['spine_ids'] = spine_ids
                session['temp_epub_path'] = temp_file_path
                session['toc_list'] = toc_list # Store ToC in session
                processing_successful = True
                print(f"Stored temp file: {temp_file_path}, {len(spine_ids)} spine items, {len(toc_list)} ToC items in session.")
                return redirect(url_for('read_item', item_index=0))
            else:
                flash('EPUB has no readable content in its spine.')
                return redirect(url_for('index'))

        except Exception as e:
            print(f"Error processing EPUB: {e}")
            flash(f'Could not process EPUB file: {e}')
            return redirect(url_for('index'))
        finally:
            # Only delete the temp file here if processing *failed*
            if not processing_successful and temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                    print(f"Cleaned up temp file after error: {temp_file_path}")
                except OSError as e:
                    print(f"Error deleting temp file {temp_file_path} after error: {e}")
    else:
        flash('Invalid file type. Please upload an EPUB file.')
        return redirect(url_for('index'))

@app.route('/read/<int:item_index>')
def read_item(item_index):
    if 'spine_ids' not in session or 'temp_epub_path' not in session:
        flash('No book loaded. Please upload an EPUB file.')
        return redirect(url_for('index'))

    spine_ids = session['spine_ids']
    temp_path = session['temp_epub_path']
    toc_list = session.get('toc_list', []) # Get ToC from session, default to empty list
    total_items = len(spine_ids)

    # Validate index
    if not (0 <= item_index < total_items):
        flash('Invalid chapter index.')
        # Redirect to the first page if index is out of bounds
        return redirect(url_for('read_item', item_index=0))

    # Check if temp file still exists
    if not os.path.exists(temp_path):
        flash('Error: Book data expired or file was removed. Please re-upload.')
        cleanup_temp_file() # Clear session data too
        return redirect(url_for('index'))

    try:
        # Re-read the EPUB to get the specific item content
        # This is less efficient than storing all content, but avoids large sessions
        book = epub.read_epub(temp_path)
        item_id = spine_ids[item_index]
        item = book.get_item_with_id(item_id)

        if item:
            content = item.get_content().decode('utf-8', 'ignore')
            return render_template('reader.html',
                                   content=content,
                                   current_index=item_index,
                                   total_items=total_items,
                                   toc=toc_list)
        else:
            # This shouldn't happen if spine_ids was built correctly
            flash(f'Error: Could not find item with ID {item_id}.')
            abort(404) # Or redirect to index

    except Exception as e:
        print(f"Error reading item {item_index} (ID: {spine_ids[item_index]}) from {temp_path}: {e}")
        flash(f'Error reading book content: {e}')
        cleanup_temp_file() # Clean up on error
        return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True) 