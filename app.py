import os
import io
import ebooklib
from ebooklib import epub
from flask import Flask, render_template, request, redirect, url_for, flash, session, abort, Response, jsonify, send_from_directory
import tempfile
import uuid
from werkzeug.utils import secure_filename
from bs4 import BeautifulSoup, NavigableString
import mimetypes
import posixpath
from openai import OpenAI
import hashlib
import fugashi
import html
import logging
import requests # Added for JPDB API calls
import re # For whitespace normalization
import shutil # Add this import at the top with other imports

app = Flask(__name__)
app.logger.setLevel(logging.DEBUG)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'supersecretkey-fallback')
app.config['OPENAI_API_KEY'] = os.environ.get('OPENAI_API_KEY')
app.config['SERVER_DEFAULT_MODEL'] = os.environ.get('DEFAULT_MODEL', 'gpt-4o-mini')
app.config['UPLOAD_FOLDER'] = 'user_epubs'
app.config['COVER_EXPORT_FOLDER'] = app.config['UPLOAD_FOLDER'] # Covers stored within book's UUID folder

# Ensure the upload folder exists
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

ALLOWED_EXTENSIONS = {'epub'}

# --- Logging Configuration (Start) ---
# Get the Werkzeug logger (used by Flask's dev server)
werkzeug_logger = logging.getLogger('werkzeug')

# Define a filter
class FilterImageRequests(logging.Filter):
    def filter(self, record):
        # Check if the log message contains a GET request for the image endpoint
        # Adjust the pattern if your image URL structure is different
        # record.getMessage() accesses the formatted log string
        msg = record.getMessage()
        return not ('GET /image/' in msg and ' 200 ' in msg)

# Add the filter to the logger
werkzeug_logger.addFilter(FilterImageRequests())
# --- Logging Configuration (End) ---

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
    # Remove book-specific session data that might be tied to a temp file concept
    # We might still use session for caching spine_ids/toc_list for an ACTIVE book_id later
    session.pop('spine_ids', None) # Clear if it was for a temp file
    session.pop('toc_list', None)  # Clear if it was for a temp file
    # No longer deleting the main EPUB file here as it's persistent.
    # old_temp_path was for a file in the system's temp dir, which we are moving away from
    # for the primary EPUB.
    if old_temp_path and tempfile.gettempdir() in old_temp_path and os.path.exists(old_temp_path):
        try:
            os.remove(old_temp_path)
            print(f"Cleaned up system temp file: {old_temp_path}")
        except OSError as e:
            print(f"Error deleting system temp file {old_temp_path}: {e}")

@app.route('/')
def index():
    # cleanup_temp_file() # We don't necessarily need to clear all session items for a book here anymore.
    # The concept of a single "active" temp book is changing.
    # Client-side will manage the list of known books.
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and allowed_file(file.filename):
        book_id = str(uuid.uuid4())
        book_folder = os.path.join(app.config['UPLOAD_FOLDER'], book_id)
        book_file_path = os.path.join(book_folder, 'book.epub')
        cover_image_filename = None # Initialize

        try:
            if not os.path.exists(book_folder):
                os.makedirs(book_folder)
            
            file.save(book_file_path)

            book = epub.read_epub(book_file_path)
            title = book.get_metadata('DC', 'title')
            if title:
                title = title[0][0]
            else:
                title = "Untitled Book"

            # --- Try to extract and save cover image ---
            cover_item = None
            # 1. Check for items explicitly marked as ITEM_COVER by ebooklib (less common)
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_COVER:
                    cover_item = item
                    break
            
            # 2. Check for <meta name="cover" content="manifest_id" />
            if not cover_item:
                meta_cover_id = None
                # Iterate through all metadata elements, looking for the one with name='cover'
                # book.opf_metadata contains the raw lxml elements from the <metadata> section of OPF
                for meta_el in getattr(book, 'opf_metadata', []): # opf_metadata might not exist on older ebooklib or minimal OPF
                    if meta_el.tag.endswith('meta') and meta_el.get('name') == 'cover':
                        meta_cover_id = meta_el.get('content')
                        break
                if meta_cover_id:
                    cover_item = book.get_item_with_id(meta_cover_id)
            
            # 3. Fallback: Check for manifest item with properties="cover-image"
            if not cover_item:
                for item in book.get_items_of_type(ebooklib.ITEM_IMAGE):
                    # item.opf_item is the lxml element for the manifest item
                    if hasattr(item, 'opf_item') and item.opf_item is not None and item.opf_item.get('properties') == 'cover-image':
                        cover_item = item
                        break
            
            if cover_item and cover_item.get_content():
                # Determine filename and save
                _, ext = os.path.splitext(cover_item.get_name()) # Use get_name() for original filename
                if not ext and cover_item.get_media_type() == 'image/jpeg': ext = '.jpg'
                elif not ext and cover_item.get_media_type() == 'image/png': ext = '.png'
                elif not ext: ext = '.jpg' # Default if still unknown
                
                cover_image_filename = f"cover{ext}"
                cover_image_path = os.path.join(book_folder, cover_image_filename)
                with open(cover_image_path, 'wb') as cover_file:
                    cover_file.write(cover_item.get_content())
                print(f"Extracted cover image for book {book_id} to {cover_image_path}")
            else:
                print(f"No cover image found or extracted for book {book_id}.")
            # --- End cover image extraction ---

            print(f"Persistently stored EPUB: {book_file_path} with ID: {book_id}")
            return jsonify({
                'book_id': book_id, 
                'title': title, 
                'cover_image_filename': cover_image_filename # Will be null if no cover
            }), 200

        except Exception as e:
            print(f"Error processing or saving EPUB with ID {book_id}: {e}")
            if os.path.exists(book_file_path):
                os.remove(book_file_path)
            # also remove cover if it was saved before error
            if cover_image_filename and os.path.exists(os.path.join(book_folder, cover_image_filename)):
                 os.remove(os.path.join(book_folder, cover_image_filename))
            if os.path.exists(book_folder):
                try:
                    os.rmdir(book_folder) 
                except OSError:
                    pass 
            return jsonify({'error': f'Could not process EPUB file: {e}'}), 500
    else:
        return jsonify({'error': 'Invalid file type. Please upload an EPUB file.'}), 400

# Modified to take book_id
@app.route('/read/<book_id>/<int:item_index>')
def read_item(book_id, item_index):
    book_file_path = os.path.join(app.config['UPLOAD_FOLDER'], book_id, 'book.epub')

    if not os.path.exists(book_file_path):
        flash('Error: Book data not found. It might have been deleted or the ID is incorrect.')
        return redirect(url_for('index'))

    try:
        book = epub.read_epub(book_file_path, options={"ignore_ncx": True}) # ignore_ncx might speed up re-reads

        spine_ids = []
        if book.spine:
            for sid, _ in book.spine:
                item_in_spine = book.get_item_with_id(sid)
                if item_in_spine and item_in_spine.get_type() == ebooklib.ITEM_DOCUMENT:
                    spine_ids.append(sid)
        
        if not spine_ids:
            flash('EPUB has no readable content in its spine.')
            return redirect(url_for('index')) # Or perhaps a specific error page for this book_id

        toc_list = get_toc_list(book, spine_ids) # get_toc_list needs the book object
        total_items = len(spine_ids)

        if not (0 <= item_index < total_items):
            flash('Invalid chapter index.')
            # Redirect to the first page of the *current* book_id
            return redirect(url_for('read_item', book_id=book_id, item_index=0))

        item_id_from_spine = spine_ids[item_index]
        item = book.get_item_with_id(item_id_from_spine)

        if not item or item.get_type() != ebooklib.ITEM_DOCUMENT:
            # --- MODIFIED: Check for ITEM_IMAGE before declaring not a document ---
            if not item or (item.get_type() != ebooklib.ITEM_DOCUMENT and item.get_type() != ebooklib.ITEM_IMAGE):
                flash('Error: Could not find or access the requested content (not a document or image type).')
                return redirect(url_for('index')) 
            # --- END MODIFICATION ---

        raw_content = item.get_content()

        # --- ADDED: Handle pure-image spine items directly ---
        if item.get_type() == ebooklib.ITEM_IMAGE:
            app.logger.debug(f"Serving direct image item: {item.file_name or 'Unknown filename'} with media type: {item.media_type}")
            return Response(raw_content, mimetype=item.media_type)
        # --- END: Handle pure-image ---

        # Use lxml parser for robustness
        soup = BeautifulSoup(raw_content, 'lxml')

        # --- MODIFIED: Image path rewriting for <img> and SVG <image> ---
        current_item_dir = posixpath.dirname(item.file_name or "")
        
        for tag in soup.find_all(["img", "image"]):
            original_src_val = None
            src_attr_to_update = None

            if tag.name == 'img':
                original_src_val = tag.get('src')
                src_attr_to_update = 'src'
            elif tag.name == 'image': # SVG <image> element
                if tag.has_attr('xlink:href'):
                    original_src_val = tag.get('xlink:href')
                    src_attr_to_update = 'xlink:href'
                elif tag.has_attr('href'):
                    original_src_val = tag.get('href')
                    src_attr_to_update = 'href'
            
            if original_src_val and src_attr_to_update:
                absolute_image_path = posixpath.normpath(posixpath.join(current_item_dir, original_src_val))
                new_image_url = url_for('serve_epub_image', book_id=book_id, image_href=absolute_image_path)
                tag[src_attr_to_update] = new_image_url
            elif original_src_val: # Had a source but couldn't determine which specific attr to update (should not happen with current logic)
                app.logger.warning(f"Found image tag {tag.name} with source but could not determine main src attribute to update: {original_src_val}")

        # --- END: Image path rewriting ---

        # Remove all <script> tags
        for script_tag in soup.find_all('script'):
            script_tag.decompose()
        
        # Remove all <link> tags that are stylesheets to avoid conflicts
        for link_tag in soup.find_all('link', rel='stylesheet'):
            link_tag.decompose()

        # Attempt to extract the title of the current chapter/item
        # Try h1, h2, h3, or title tag within the content
        chapter_title_tag = soup.find(['h1', 'h2', 'h3', 'title'])
        current_chapter_title = chapter_title_tag.string if chapter_title_tag else "Chapter"

        # Pass only the body content if available, otherwise the whole soup
        body_content = soup.body if soup.body else soup
        
        # Convert NavigableString to string to ensure it's serializable for the template
        processed_content = str(body_content)

        # Get book title for display
        book_title_meta = book.get_metadata('DC', 'title')
        book_title = book_title_meta[0][0] if book_title_meta and book_title_meta[0] else "EPUB Book"
        
        # Pagination: Determine previous and next item indices
        prev_index = item_index - 1 if item_index > 0 else None
        next_index = item_index + 1 if item_index < len(spine_ids) - 1 else None
        
        # print(f"Serving item {item_index} of {len(spine_ids)} for book {book_id}")
        # print(f"TOC: {toc_list}")

        return render_template('reader.html', 
                               content=processed_content, 
                               book_title=book_title,
                               current_chapter_title=current_chapter_title,
                               current_index=item_index, 
                               prev_index=prev_index, 
                               next_index=next_index,
                               toc=toc_list,
                               book_id=book_id,
                               total_items=len(spine_ids),
                               model_name=app.config.get('SERVER_DEFAULT_MODEL', 'gpt-4o-mini'),
                               show_jlpt_filter=session.get('show_jlpt_filter', False),
                               jlpt_enabled=session.get('jlpt_highlighting_enabled', False),
                               openai_key_configured=bool(app.config.get('OPENAI_API_KEY'))
                               )

    except FileNotFoundError:
        flash(f'Book file not found for ID: {book_id}. It might have been deleted.')
        return redirect(url_for('index'))

# Modified to take book_id
@app.route('/image/<book_id>/<path:image_href>')
def serve_epub_image(book_id, image_href):
    book_file_path = os.path.join(app.config['UPLOAD_FOLDER'], book_id, 'book.epub')

    if not os.path.exists(book_file_path):
        print(f"Error: EPUB file not found for book_id {book_id}: {book_file_path}")
        abort(404)

    try:
        book = epub.read_epub(book_file_path, options={"ignore_ncx": True})
        normalized_href = posixpath.normpath(image_href)
        image_item = book.get_item_with_href(normalized_href)

        if image_item:
            image_data = image_item.get_content()
            mime_type, _ = mimetypes.guess_type(normalized_href)
            if not mime_type: # Fallback logic
                # ... (existing mime type fallback logic) ...
                 if normalized_href.lower().endswith('.jpg') or normalized_href.lower().endswith('.jpeg'):
                     mime_type = 'image/jpeg'
                 elif normalized_href.lower().endswith('.png'):
                     mime_type = 'image/png'
                 elif normalized_href.lower().endswith('.gif'):
                     mime_type = 'image/gif'
                 elif normalized_href.lower().endswith('.svg'):
                     mime_type = 'image/svg+xml'
                 else:
                     mime_type = 'application/octet-stream'

            print(f"Serving image for book {book_id}: {normalized_href} with MIME type: {mime_type}")
            return Response(image_data, mimetype=mime_type)
        else:
            print(f"Error: Image item not found in EPUB for book {book_id}: {normalized_href}")
            abort(404)

    except Exception as e:
        print(f"Error serving image {image_href} for book {book_id} from {book_file_path}: {e}")
        abort(500)

# --- Translation Endpoint (Simplified) --- #
@app.route('/translate', methods=['POST'])
def translate_content():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    # item_index is no longer needed here, client handles display
    content = data.get('content') # This is the *original* content to translate
    target_language = data.get('target_language')
    model = data.get('model')
    user_api_key = data.get('api_key')
    cefr_level = data.get('cefr_level')

    # Validate required fields
    if content is None or target_language is None or model is None:
        return jsonify({"error": "Missing required fields: content, target_language, model"}), 400

    # --- API Call Logic --- 
    api_key_to_use = user_api_key if user_api_key else app.config.get('OPENAI_API_KEY')
    if not api_key_to_use: return jsonify({"error": "OpenAI API key not configured..."}), 400
    
    # Construct prompt, asking for ONLY the translated HTML
    system_prompt = "You are a helpful translator. You translate the provided HTML content while preserving the HTML structure. ONLY return the translated HTML content, with no introductory text, explanations, or markdown formatting like ```html."
    user_prompt_prefix = f"Translate the following HTML content to {target_language}"
    if cefr_level: user_prompt_prefix += f", simplifying for CEFR level {cefr_level}. Preserve HTML tags."
    else: user_prompt_prefix += ". Preserve HTML tags."
    full_user_prompt = f"{user_prompt_prefix}\n\nHTML Content:\n```html\n{content}\n```"

    # Logging (consider logging less in production)
    print(f"--- Translation Request --- Language: {target_language}, Model: {model}, CEFR: {cefr_level or 'N/A'}")

    try:
        client = OpenAI(api_key=api_key_to_use)
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": full_user_prompt}]
        )
        translated_text = completion.choices[0].message.content.strip()

        # Attempt to remove potential markdown backticks anyway, just in case
        if translated_text.startswith("```html"): translated_text = translated_text[7:].strip()
        elif translated_text.startswith("```"): translated_text = translated_text[3:].strip()
        if translated_text.endswith("```"): translated_text = translated_text[:-3].strip()
        
        print(f"Translation successful. First 100 chars: {translated_text[:100]}...")

        return jsonify({"translated_text": translated_text})

    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
        return jsonify({"error": f"Error during translation: {e}"}), 500

# Ensure /toggle_jlpt is independent of a specific book or uses book_id if its effect is per-book
# The current toggle_jlpt looks session-global, which is fine.

# Translate content route might need a book_id if the content it gets depends on the book's structure
# For now, translate_content gets 'content' directly from payload, which is client-sent original text.
# So it might be okay without book_id for now, but something to keep in mind if we wanted to pass context.

# The /delete_cached_translation route seems to use current_index from a global context.
# If translations are tied to a book, it should also take book_id.
# However, the current client-side translation caching is by page index, not book_id + page index.
# This will need to be updated on the client side.

@app.route('/delete_cached_translation', methods=['POST'])
def delete_cached_translation_route():
    data = request.get_json()
    item_index = data.get('item_index') # Client should also send book_id
    # book_id = data.get('book_id') # Client will need to send this
    if item_index is None: # or book_id is None:
        return jsonify({'success': False, 'error': 'Missing item_index'}), 400 # or book_id

    # This route is about client-side cache, server doesn't do much here.
    # The logic for *which* cache to delete (tied to book_id and item_index) will be client-side.
    # This route is more of a signal or could be removed if client handles deletion entirely.
    # For now, let's assume client will enhance its cache keys.
    print(f"Received signal to acknowledge deletion of cached translation for item index: {item_index}.")
    return jsonify({'success': True, 'message': 'Client-side cache deletion acknowledged.'})

# New route to serve cover images
@app.route('/book_cover/<book_id>/<filename>')
def serve_book_cover(book_id, filename):
    # Sanitize filename to prevent directory traversal, although send_from_directory does this too
    safe_filename = secure_filename(filename) 
    book_specific_folder = os.path.join(app.config['COVER_EXPORT_FOLDER'], book_id)
    # Explicitly check if the requested file exists to provide a specific error or placeholder
    if not os.path.exists(os.path.join(book_specific_folder, safe_filename)):
        # Optionally, return a placeholder image or a 404
        # For now, let's 404 if specific cover is not found
        print(f"Cover image {safe_filename} not found for book {book_id}")
        abort(404)
    return send_from_directory(book_specific_folder, safe_filename)

@app.route('/toggle_jlpt', methods=['POST'])
def toggle_jlpt():
    data = request.get_json()
    if data is None or 'enabled' not in data or not isinstance(data['enabled'], bool):
        return jsonify({'success': False, 'error': 'Invalid payload. "enabled" boolean is required.'}), 400
    
    is_enabled = data['enabled']
    session['jlpt_highlighting_enabled'] = is_enabled
    print(f"JLPT highlighting set to: {is_enabled}")
    return jsonify({'success': True, 'jlpt_highlighting_enabled': is_enabled})

@app.route('/get_jpdb_data', methods=['POST'])
def get_jpdb_data():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    # Changed from text_content to text_segments
    text_segments_raw = data.get('text_segments') 
    api_key = data.get('jpdb_api_key')

    # Validate text_segments
    if not text_segments_raw or not isinstance(text_segments_raw, list):
        return jsonify({"error": "Missing or invalid 'text_segments' (must be a list of strings)"}), 400
    if not all(isinstance(s, str) for s in text_segments_raw):
        return jsonify({"error": "Invalid 'text_segments': all items must be strings"}), 400
    
    if not api_key or not isinstance(api_key, str):
        return jsonify({"error": "Missing or invalid 'jpdb_api_key'"}), 400

    # Normalize each segment and filter out empty ones
    all_clean_segments = []
    total_original_chars = 0
    for segment_text in text_segments_raw:
        total_original_chars += len(segment_text)
        normalized_segment = re.sub(r'\s+', ' ', segment_text).strip()
        if normalized_segment: # Only add non-empty segments
            all_clean_segments.append(normalized_segment)
    
    total_normalized_chars = sum(len(s) for s in all_clean_segments)
    # app.logger.info(f"Received {len(text_segments_raw)} raw segments, processed into {len(all_clean_segments)} non-empty clean segments.")
    # app.logger.info(f"Total chars original: {total_original_chars}, Total chars normalized for API: {total_normalized_chars}")

    if not all_clean_segments:
        app.logger.info("No non-empty segments to process after cleaning.")
        return jsonify([])

    # Changed from MAX_CHARS_PER_API_BATCH to MAX_BYTES_PER_API_BATCH
    MAX_BYTES_PER_API_BATCH = 15000 # Using 15KB as a conservative byte limit
    MAX_SEGMENTS_PER_API_BATCH = 75 
    
    TOKEN_FIELDS = ['vocabulary_index', 'position', 'length', 'furigana']
    VOCAB_FIELDS = ['vid', 'sid', 'card_state']
    
    jpdb_api_url = 'https://jpdb.io/api/v1/parse'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }

    all_processed_tokens_globally_offset = []
    current_segment_list_start_index = 0 # Index in all_clean_segments for the current batch
    # This offset tracks the total length of *all_clean_segments* processed in *previous* batches.
    global_offset_processed_across_batches = 0 

    while current_segment_list_start_index < len(all_clean_segments):
        segments_for_this_batch = []
        # Changed from chars_in_this_batch to bytes_in_this_batch
        bytes_in_this_batch = 0 
        global_offset_at_start_of_this_api_call = global_offset_processed_across_batches
        
        temp_next_segment_start_index = current_segment_list_start_index
        for i in range(current_segment_list_start_index, len(all_clean_segments)):
            segment_to_consider = all_clean_segments[i]
            segment_byte_length = len(segment_to_consider.encode('utf-8'))

            if len(segments_for_this_batch) < MAX_SEGMENTS_PER_API_BATCH and \
               bytes_in_this_batch + segment_byte_length <= MAX_BYTES_PER_API_BATCH:
                segments_for_this_batch.append(segment_to_consider)
                bytes_in_this_batch += segment_byte_length
                temp_next_segment_start_index = i + 1
            else:
                # If this segment makes the batch too large (or it's the first and too big itself)
                if not segments_for_this_batch and segment_byte_length <= MAX_BYTES_PER_API_BATCH:
                    segments_for_this_batch.append(segment_to_consider)
                    bytes_in_this_batch += segment_byte_length
                    temp_next_segment_start_index = i + 1
                break 
        
        current_segment_list_start_index = temp_next_segment_start_index

        if not segments_for_this_batch:
            # Check if the segment that was *just about to be processed* (or was the first in a potential new batch)
            # was too long by itself.
            # The index for this segment would be `current_segment_list_start_index -1` if it was advanced one step.
            if current_segment_list_start_index > 0: # Ensure index is valid
                potentially_long_segment_index = current_segment_list_start_index -1 
                # Ensure this index is still within the bounds of all_clean_segments if it was the last one
                if potentially_long_segment_index < len(all_clean_segments):
                    segment_that_was_too_long = all_clean_segments[potentially_long_segment_index]
                    if len(segment_that_was_too_long.encode('utf-8')) > MAX_BYTES_PER_API_BATCH:
                        app.logger.warning(f"Segment at index {potentially_long_segment_index} is too long ({len(segment_that_was_too_long.encode('utf-8'))} bytes) for MAX_BYTES_PER_API_BATCH ({MAX_BYTES_PER_API_BATCH}). Skipping it.")
                        # global_offset_processed_across_batches needs to be advanced by the *character length* for client-side consistency
                        global_offset_processed_across_batches += len(segment_that_was_too_long) 
                        continue # Try next batch (current_segment_list_start_index is already advanced)
            
            app.logger.info("No more segments to form a new batch or all processed.")
            break

        app.logger.info(f"Preparing batch: {len(segments_for_this_batch)} segments, approx {bytes_in_this_batch} bytes. Global char offset for this batch starts after {global_offset_at_start_of_this_api_call} chars.")

        payload = {
            'text': segments_for_this_batch,
            'position_length_encoding': 'utf16',
            'token_fields': TOKEN_FIELDS,
            'vocabulary_fields': VOCAB_FIELDS,
        }
        
        response_from_jpdb = None
        try:
            response_from_jpdb = requests.post(jpdb_api_url, headers=headers, json=payload)
            response_from_jpdb.raise_for_status()
            jpdb_data = response_from_jpdb.json()

            jpdb_vocab_list = jpdb_data.get('vocabulary', [])
            vocab_map = []
            for i_vm, v_entry in enumerate(jpdb_vocab_list):
                if not isinstance(v_entry, (list, tuple)) or len(v_entry) < 3:
                    app.logger.error(f"Skipping malformed vocab entry {i_vm}: {v_entry}")
                    vocab_map.append({'vid': None, 'sid': None, 'state': ['error-vocab-format']})
                    continue 
                vocab_map.append({
                    'vid': v_entry[0],
                    'sid': v_entry[1],
                    'state': v_entry[2] if v_entry[2] else ['not-in-deck']
                })

            tokens_data_from_api = jpdb_data.get('tokens', [])
            
            if len(tokens_data_from_api) != len(segments_for_this_batch):
                app.logger.warning(f"Mismatch: sent {len(segments_for_this_batch)} segments, got {len(tokens_data_from_api)} token lists.")

            # This offset tracks character position *within the current API batch's concatenated segments*
            character_offset_within_this_api_batch = 0 
            for segment_idx_in_batch, tokens_for_one_segment in enumerate(tokens_data_from_api):
                if segment_idx_in_batch >= len(segments_for_this_batch):
                    app.logger.warning(f"More token lists ({segment_idx_in_batch}) than segments sent in batch ({len(segments_for_this_batch)}). Skipping extras.")
                    break
                
                current_segment_text = segments_for_this_batch[segment_idx_in_batch]

                for raw_token_idx, raw_token in enumerate(tokens_for_one_segment):
                    if not isinstance(raw_token, (list, tuple)) or len(raw_token) < 4:
                        app.logger.error(f"Skipping malformed raw_token {raw_token_idx} in segment {segment_idx_in_batch}. raw_token: {raw_token}.")
                        continue
                    
                    vocab_idx, position_in_segment, length, furigana_data = raw_token[0:4]

                    if not all(isinstance(x, int) for x in [vocab_idx, position_in_segment, length]):
                        app.logger.error(f"Invalid type in token data: v:{vocab_idx}({type(vocab_idx)}), p:{position_in_segment}({type(position_in_segment)}), l:{length}({type(length)}). Skipping {raw_token}")
                        continue
                    
                    card_info = {}
                    try:
                        if vocab_idx < 0: 
                            card_info = {'state': ['unknown-negative-vocab-idx']}
                        elif vocab_idx < len(vocab_map): 
                            card_info = vocab_map[vocab_idx] 
                        else: 
                            app.logger.warning(f"vocab_idx {vocab_idx} is out of bounds for vocab_map (len: {len(vocab_map)}). raw_token: {raw_token}")
                            card_info = {'state': ['unknown-vocab-idx-out-of-bounds']}
                    except Exception as e_map_access:
                        app.logger.error(f"Error accessing vocab_map for {raw_token}: {e_map_access}")
                        card_info = {'state': ['error-vocab-map-access']}
                        continue

                    rubies = []
                    if furigana_data and isinstance(furigana_data, list):
                        current_offset_in_token_surface = 0
                        for part in furigana_data:
                            if isinstance(part, str): 
                                current_offset_in_token_surface += len(part)
                            elif isinstance(part, list) and len(part) == 2: 
                                base_text_segment_part, ruby_text = part # Renamed to avoid conflict
                                if isinstance(base_text_segment_part, str) and isinstance(ruby_text, str):
                                    ruby_seg_start = current_offset_in_token_surface
                                    ruby_seg_length = len(base_text_segment_part)
                                    rubies.append({
                                        'text': ruby_text, 'start': ruby_seg_start, 
                                        'length': ruby_seg_length, 'end': ruby_seg_start + ruby_seg_length
                                    })
                                    current_offset_in_token_surface += ruby_seg_length
                                else: app.logger.warning(f"Malformed furigana part (non-string elements): {part} in {raw_token}")
                            else: app.logger.warning(f"Malformed furigana part (not str or list[2]): {part} in {raw_token}")
                    elif furigana_data: app.logger.warning(f"Furigana data not a list: {furigana_data} for {raw_token}")
                    
                    # Calculate global start position for this token
                    # global_offset_at_start_of_this_api_call: offset before any text in *this* API call
                    # character_offset_within_this_api_batch: offset of the current segment *within this API call's text block*
                    # position_in_segment: offset of the token *within the current segment*
                    token_start_global = global_offset_at_start_of_this_api_call + character_offset_within_this_api_batch + position_in_segment
                    
                    all_processed_tokens_globally_offset.append({
                        'start': token_start_global, 
                        'length': length,
                        'end': token_start_global + length, 
                        'state': card_info.get('state', ['unknown']),
                        'rubies': rubies
                    })
                # Add length of the current segment (as sent to API) to the character_offset_within_this_api_batch
                character_offset_within_this_api_batch += len(current_segment_text)
            
            # After processing all tokens for this batch, update the overall global character offset
            # global_offset_processed_across_batches is advanced by CHARACTER count of segments in this batch
            # because client-side DOM traversal works with character offsets.
            # bytes_in_this_batch was used for API limit, but global_offset for token positioning needs char count.
            chars_processed_in_this_batch_for_global_offset = sum(len(s) for s in segments_for_this_batch)
            global_offset_processed_across_batches += chars_processed_in_this_batch_for_global_offset 
            # current_segment_list_start_index is already advanced by the batch collection loop

        except requests.exceptions.HTTPError as http_err:
            error_detail_from_response = "No response content or content not JSON."
            status_code_from_response = 500 
            if response_from_jpdb is not None:
                status_code_from_response = response_from_jpdb.status_code
                try: 
                    error_detail_from_response = response_from_jpdb.json().get('error_message', response_from_jpdb.text)
                except ValueError: error_detail_from_response = response_from_jpdb.text
            
            failed_batch_info = f"Batch starting with overall global char offset {global_offset_at_start_of_this_api_call}, containing {len(segments_for_this_batch)} segments, approx {bytes_in_this_batch} bytes."
            error_message = f"HTTP error occurred on {failed_batch_info}: {http_err} - Details: {error_detail_from_response}"
            app.logger.error(error_message)
            return jsonify({"error": error_message, "jpdb_response_text": error_detail_from_response, "status_code": status_code_from_response, "partial_results": all_processed_tokens_globally_offset}), status_code_from_response
        except requests.exceptions.RequestException as req_err: 
            failed_batch_info = f"Batch starting with overall global char offset {global_offset_at_start_of_this_api_call}, containing {len(segments_for_this_batch)} segments, approx {bytes_in_this_batch} bytes."
            error_message = f"Request failed on {failed_batch_info}: {req_err}"
            app.logger.error(error_message)
            return jsonify({"error": error_message, "partial_results": all_processed_tokens_globally_offset}), 500
        except Exception as e: 
            failed_batch_info = f"Batch starting with overall global char offset {global_offset_at_start_of_this_api_call}, containing {len(segments_for_this_batch)} segments, approx {bytes_in_this_batch} bytes."
            error_message = f"Unexpected error processing {failed_batch_info}: {str(e)}"
            app.logger.error(error_message, exc_info=True)
            return jsonify({"error": error_message, "partial_results": all_processed_tokens_globally_offset}), 500
            
    app.logger.info(f"Successfully processed all batches. Total tokens generated: {len(all_processed_tokens_globally_offset)}")
    return jsonify(all_processed_tokens_globally_offset)

@app.route('/delete_book/<book_id>', methods=['POST'])
def delete_book_route(book_id):
    if not book_id: # Basic validation
        return jsonify({'success': False, 'error': 'Book ID is required.'}), 400
    
    # Validate UUID format for book_id to be safer, though os.path.join and rmtree are generally robust against basic traversal with it.
    try:
        uuid.UUID(book_id) # This will raise ValueError if book_id is not a valid UUID
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid Book ID format.'}), 400

    book_folder_path = os.path.join(app.config['UPLOAD_FOLDER'], book_id)

    if not os.path.exists(book_folder_path) or not os.path.isdir(book_folder_path):
        # If folder doesn't exist, consider it successfully "deleted" or cleaned up.
        app.logger.info(f"Book folder {book_folder_path} not found. Already considered deleted.")
        return jsonify({'success': True, 'message': 'Book not found or already deleted.'}), 200

    try:
        shutil.rmtree(book_folder_path)
        app.logger.info(f"Successfully deleted book folder: {book_folder_path}")
        return jsonify({'success': True, 'message': 'Book deleted successfully.'}), 200
    except Exception as e:
        app.logger.error(f"Error deleting book folder {book_folder_path}: {e}")
        return jsonify({'success': False, 'error': f'Could not delete book: {str(e)}'}), 500

# REMOVED: @app.route('/settings') and settings_page() function

# REMOVED: if __name__ == '__main__': block
# Production WSGI server (like Gunicorn) will import and run the 'app' object directly. 