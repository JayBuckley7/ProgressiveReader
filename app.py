import os
import io
import ebooklib
from ebooklib import epub
from flask import Flask, render_template, request, redirect, url_for, flash, session, abort, Response, jsonify
import tempfile
from werkzeug.utils import secure_filename
from bs4 import BeautifulSoup
import mimetypes
import posixpath
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'supersecretkey-fallback')
app.config['OPENAI_API_KEY'] = os.environ.get('OPENAI_API_KEY')
app.config['SERVER_DEFAULT_MODEL'] = os.environ.get('DEFAULT_MODEL', 'gpt-4o-mini')

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
    toc_list = session.get('toc_list', [])
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
        # Optimization: Ignore NCX parsing if not needed here
        book = epub.read_epub(temp_path, options={"ignore_ncx": True})
        item_id = spine_ids[item_index]
        item = book.get_item_with_id(item_id)

        if item:
            raw_content = item.get_content()
            # Decode safely
            try:
                html_content = raw_content.decode('utf-8')
            except UnicodeDecodeError:
                # Fallback or log error, for now using ignore
                html_content = raw_content.decode('utf-8', 'ignore')

            # Parse HTML and rewrite image paths
            soup = BeautifulSoup(html_content, 'lxml') # Use lxml parser
            current_item_dir = posixpath.dirname(item.file_name) # Directory of the current HTML file

            for img_tag in soup.find_all('img'):
                original_src = img_tag.get('src')
                if original_src:
                    # Resolve the absolute path within the EPUB
                    # Use posixpath for platform-independent URL path handling
                    absolute_image_path = posixpath.normpath(posixpath.join(current_item_dir, original_src))
                    # Generate URL for our image serving endpoint
                    img_tag['src'] = url_for('serve_epub_image', image_href=absolute_image_path)
                    # Optional: Add error handling if image can't be resolved later
                    # img_tag['onerror'] = "this.style.display='none';"

            # Get the modified HTML string
            modified_content_str = soup.prettify()

            # Check if OpenAI key is configured in the environment
            openai_key_configured = bool(app.config.get('OPENAI_API_KEY'))
            server_default_model = app.config.get('SERVER_DEFAULT_MODEL')

            return render_template('reader.html',
                                   content=modified_content_str, # Pass modified HTML
                                   current_index=item_index,
                                   total_items=total_items,
                                   toc=toc_list,
                                   openai_key_configured=openai_key_configured,
                                   server_default_model=server_default_model) # Pass server default model
        else:
            flash(f'Error: Could not find item with ID {item_id}.')
            abort(404)

    except Exception as e:
        print(f"Error reading item {item_index} (ID: {spine_ids.get(item_index, 'N/A')}) from {temp_path}: {e}")
        flash(f'Error reading book content: {e}')
        cleanup_temp_file()
        return redirect(url_for('index'))

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

# --- Translation Endpoint --- #
@app.route('/translate', methods=['POST'])
def translate_content():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    content = data.get('content')
    target_language = data.get('target_language')
    model = data.get('model')
    user_api_key = data.get('api_key') # Key from cookie (if provided)
    cefr_level = data.get('cefr_level') # Optional CEFR level

    if not content or not target_language or not model:
        return jsonify({"error": "Missing required fields: content, target_language, model"}), 400

    # Determine API Key: User cookie key > Server .env key
    api_key_to_use = user_api_key if user_api_key else app.config.get('OPENAI_API_KEY')

    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured on server or provided by user."}), 400

    # --- Construct the prompt --- # 
    # Basic prompt (can be refined)
    system_prompt = "You are a helpful translator. Translate the following HTML content."
    user_prompt_prefix = f"Translate the following HTML content to {target_language}"
    
    # Add CEFR constraint if provided
    if cefr_level:
        user_prompt_prefix += f", simplifying the vocabulary and sentence structure to be appropriate for a CEFR {cefr_level} learner."
        system_prompt += f" The target audience is a CEFR {cefr_level} learner." # Reinforce in system prompt

    full_user_prompt = f"{user_prompt_prefix}\n\nKeep the original HTML structure and tags intact as much as possible.\n\nHTML Content:\n```html\n{content}\n```"
    
    print(f"--- Translation Request ---")
    print(f"Model: {model}")
    print(f"Target Lang: {target_language}")
    print(f"CEFR Level: {cefr_level or 'N/A'}")
    print(f"Using API Key: {'User Provided' if user_api_key else 'Server Configured'}")
    # print(f"System Prompt: {system_prompt}") # Can be verbose
    # print(f"User Prompt Prefix: {user_prompt_prefix}") # Can be verbose
    # print(f"Content Snippet: {content[:100]}...")
    print(f"---------------------------")

    try:
        client = OpenAI(api_key=api_key_to_use)
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_user_prompt}
            ]
            # Consider adding temperature, max_tokens etc. if needed
        )

        translated_text = completion.choices[0].message.content
        
        # Basic cleanup: Sometimes models wrap the result in ```html ... ```
        if translated_text.strip().startswith("```html"):
            translated_text = translated_text.strip()[7:]
        if translated_text.strip().endswith("```"):
            translated_text = translated_text.strip()[:-3]
            
        print(f"Translation successful. Length: {len(translated_text)}")
        return jsonify({"translated_text": translated_text.strip()})

    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
        error_message = f"Error during translation: {e}"
        # Check for specific API errors if needed (e.g., invalid key, rate limit)
        # For now, return a generic 500
        return jsonify({"error": error_message}), 500

if __name__ == '__main__':
    app.run(debug=True) 