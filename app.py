import os
import io
import ebooklib
from ebooklib import epub
from flask import Flask, render_template, request, redirect, url_for, flash, session, abort, Response, jsonify
import tempfile
from werkzeug.utils import secure_filename
from bs4 import BeautifulSoup, NavigableString
import mimetypes
import posixpath
from dotenv import load_dotenv
from openai import OpenAI
import hashlib
import fugashi
import html
import logging

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'supersecretkey-fallback')
app.config['OPENAI_API_KEY'] = os.environ.get('OPENAI_API_KEY')
app.config['SERVER_DEFAULT_MODEL'] = os.environ.get('DEFAULT_MODEL', 'gpt-4o-mini')

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

# --- JLPT Highlighting (Start) ---
# Very basic hardcoded JLPT dictionary for demo
JLPT_DICT = {
    '食べる': 'N5',
    '読む': 'N5',
    '行く': 'N5',
    '私': 'N5',
    '日本語': 'N4',
    '新聞': 'N3',
    '記事': 'N2'
    # Add more words as needed for testing
}

def add_jlpt_highlighting(html_content):
    """Tokenizes Japanese text and adds JLPT level spans."""
    try:
        tagger = fugashi.Tagger()
        soup = BeautifulSoup(html_content, 'lxml')

        # Find elements likely to contain main text content
        # Adjust selectors as needed based on EPUB structure
        content_tags = soup.find_all(['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

        for tag in content_tags:
            new_contents = []
            for child in tag.contents:
                if isinstance(child, NavigableString) and child.strip():
                    text = str(child)
                    tokens = tagger(text)
                    current_frag = []
                    for token in tokens:
                        lemma = token.feature.lemma
                        surface = token.surface
                        level = JLPT_DICT.get(lemma)
                        if level:
                            # Create a new span tag for the highlighted word
                            span_tag = soup.new_tag("span", attrs={"class": level.lower()})
                            span_tag.string = html.escape(surface)
                            current_frag.append(span_tag)
                        else:
                            # Append the non-highlighted text directly
                            current_frag.append(html.escape(surface))
                    # Replace the original string with the list of new strings/tags
                    new_contents.extend(current_frag)
                else:
                    # Keep non-string elements (like <a>, <img>, etc.) as they are
                    new_contents.append(child)
            
            # Replace the tag's original contents with the new list
            tag.clear()
            for item in new_contents:
                tag.append(item)

        return str(soup)
    except Exception as e:
        print(f"Error during JLPT highlighting: {e}")
        return html_content # Return original content on error
# --- JLPT Highlighting (End) ---

# Helper to clean up old temp file path from session
def cleanup_temp_file(path_key='temp_epub_path'):
    old_temp_path = session.pop(path_key, None)
    # Remove book-specific session data
    session.pop('spine_ids', None)
    session.pop('toc_list', None)
    # Reset JLPT highlighting state when cleaning up book
    session.pop('jlpt_enabled', None)
    # session.pop('book_language', None) # No longer storing book language here
    # NOTE: Server-side caches removed, client handles caching now
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

                # Reset JLPT toggle state for new book (default to off)
                session['jlpt_enabled'] = False

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
    toc_list = session.get('toc_list', [])
    total_items = len(spine_ids)

    # Validate index
    if not (0 <= item_index < total_items):
        flash('Invalid chapter index.')
        return redirect(url_for('read_item', item_index=0))

    # Check if temp file still exists
    if not os.path.exists(temp_path):
        flash('Error: Book data expired or file was removed. Please re-upload.')
        cleanup_temp_file()
        return redirect(url_for('index'))

    # --- Always Fetch Original Content --- 
    # Server no longer caches display content, client will check localStorage
    try:
        book = epub.read_epub(temp_path, options={"ignore_ncx": True})
        item_id = spine_ids[item_index]
        item = book.get_item_with_id(item_id)

        if not item:
            flash(f'Error: Could not find item with ID {item_id}.')
            abort(404)

        raw_content = item.get_content()
        try: html_content = raw_content.decode('utf-8')
        except UnicodeDecodeError: html_content = raw_content.decode('utf-8', 'ignore')

        # Rewrite image paths in the original content
        soup = BeautifulSoup(html_content, 'lxml')
        current_item_dir = posixpath.dirname(item.file_name)
        for img_tag in soup.find_all('img'):
            original_src = img_tag.get('src')
            if original_src:
                absolute_image_path = posixpath.normpath(posixpath.join(current_item_dir, original_src))
                img_tag['src'] = url_for('serve_epub_image', image_href=absolute_image_path)
        
        content_with_images = soup.prettify()

        # --- Apply JLPT highlighting (Conditional based on toggle state) ---
        content_to_render = content_with_images # Default to non-highlighted
        jlpt_enabled = session.get('jlpt_enabled', False)
        
        # Apply if toggle is enabled (Visibility controlled by client-side JS based on target language)
        if jlpt_enabled:
            print("Applying JLPT highlighting (toggle enabled)...")
            content_to_render = add_jlpt_highlighting(content_with_images)
        # --- End JLPT highlighting ---
        
    except Exception as e:
        print(f"Error reading item {item_index} (ID: {spine_ids.get(item_index, 'N/A')}) from {temp_path}: {e}")
        flash(f'Error reading book content: {e}')
        cleanup_temp_file()
        return redirect(url_for('index'))

    # --- Render the page with original content --- 
    openai_key_configured = bool(app.config.get('OPENAI_API_KEY'))
    server_default_model = app.config.get('SERVER_DEFAULT_MODEL')

    return render_template('reader.html',
                           content=content_to_render, # Pass potentially highlighted content
                           current_index=item_index,
                           total_items=total_items,
                           toc=toc_list,
                           openai_key_configured=openai_key_configured,
                           server_default_model=server_default_model,
                           jlpt_enabled=jlpt_enabled) # Pass toggle state only

# New route to serve images from the EPUB
@app.route('/image/<path:image_href>')
def serve_epub_image(image_href):
    if 'temp_epub_path' not in session:
        print("Error: No EPUB path in session for image request.")
        abort(404)

    temp_path = session['temp_epub_path']

    if not os.path.exists(temp_path):
        print(f"Error: EPUB temp file not found: {temp_path}")
        abort(404)

    try:
        # Re-read the EPUB (consider caching the book object in session/cache if performance is critical)
        # ignore_ncx=True is a small optimization if we only need item access by href
        book = epub.read_epub(temp_path, options={"ignore_ncx": True})

        # Normalize the requested href just in case
        normalized_href = posixpath.normpath(image_href)

        image_item = book.get_item_with_href(normalized_href)

        if image_item:
            image_data = image_item.get_content()
            # Guess MIME type from href
            mime_type, _ = mimetypes.guess_type(normalized_href)
            if not mime_type:
                 # Fallback if guess fails - common for EPUB images
                 if normalized_href.lower().endswith('.jpg') or normalized_href.lower().endswith('.jpeg'):
                     mime_type = 'image/jpeg'
                 elif normalized_href.lower().endswith('.png'):
                     mime_type = 'image/png'
                 elif normalized_href.lower().endswith('.gif'):
                     mime_type = 'image/gif'
                 elif normalized_href.lower().endswith('.svg'):
                     mime_type = 'image/svg+xml'
                 else:
                     mime_type = 'application/octet-stream' # Generic fallback

            print(f"Serving image: {normalized_href} with MIME type: {mime_type}")
            return Response(image_data, mimetype=mime_type)
        else:
            print(f"Error: Image item not found in EPUB: {normalized_href}")
            abort(404)

    except Exception as e:
        print(f"Error serving image {image_href} from {temp_path}: {e}")
        abort(500)

# --- JLPT Toggle Endpoint --- #
@app.route('/toggle_jlpt', methods=['POST'])
def toggle_jlpt():
    data = request.get_json()
    if data and 'enabled' in data:
        enabled_state = bool(data['enabled']) # Ensure boolean
        session['jlpt_enabled'] = enabled_state
        print(f"JLPT Highlighting state set to: {enabled_state}")
        return jsonify({"success": True, "jlpt_enabled": enabled_state})
    else:
        print("Invalid request to /toggle_jlpt")
        return jsonify({"success": False, "error": "Invalid payload"}), 400

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

    # --- REMOVED Translation Cache Logic --- 

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
    # print(f"System Prompt: {system_prompt}") # Optional: Log full prompts only if debugging
    # print(f"User Prompt: {full_user_prompt}")

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

        # --- REMOVED Storing in Server Cache --- 
        
        return jsonify({"translated_text": translated_text})

    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
        return jsonify({"error": f"Error during translation: {e}"}), 500

if __name__ == '__main__':
    app.run(debug=True) 