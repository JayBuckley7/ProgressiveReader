import os
import posixpath
import mimetypes
from flask import (
    Blueprint, render_template, redirect, url_for, flash, 
    session, abort, Response, current_app
)
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

reader_bp = Blueprint('reader', __name__)

# Helper function to extract Toc mapping to spine index (Moved from app.py)
def get_toc_list(book, spine_ids):
    toc_list = []
    spine_file_map = {}
    for index, item_id in enumerate(spine_ids):
        item = book.get_item_with_id(item_id)
        if item and item.file_name:
            base_filename = item.file_name.split('#')[0]
            if base_filename not in spine_file_map:
                spine_file_map[base_filename] = index

    def process_toc_item(item):
        if isinstance(item, ebooklib.epub.Link):
            href_filename = item.href.split('#')[0]
            if href_filename in spine_file_map:
                item_index = spine_file_map[href_filename]
                toc_list.append({
                    'title': item.title or "(No Title)",
                    'index': item_index,
                    'href': item.href
                })
        elif isinstance(item, ebooklib.epub.Section):
            for child_item in item.children:
                process_toc_item(child_item)
        elif isinstance(item, tuple) and len(item) > 0:
             if isinstance(item[0], (ebooklib.epub.Section, ebooklib.epub.Link)):
                 process_toc_item(item[0])
             if len(item) > 1 and isinstance(item[1], list):
                 for child_item in item[1]:
                     process_toc_item(child_item)

    for root_item in book.toc:
        process_toc_item(root_item)

    seen_indices = set()
    unique_toc = []
    for entry in toc_list:
        if entry['index'] not in seen_indices:
            unique_toc.append(entry)
            seen_indices.add(entry['index'])

    return unique_toc


@reader_bp.route('/read/<book_id>/<int:item_index>')
def read_item(book_id, item_index):
    book_file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], book_id, 'book.epub')

    if not os.path.exists(book_file_path):
        flash('Error: Book data not found. It might have been deleted or the ID is incorrect.')
        return redirect(url_for('main.index')) # Redirect to main index

    try:
        book = epub.read_epub(book_file_path, options={"ignore_ncx": True})

        spine_ids = []
        if book.spine:
            for sid, _ in book.spine:
                item_in_spine = book.get_item_with_id(sid)
                if item_in_spine and item_in_spine.get_type() == ebooklib.ITEM_DOCUMENT:
                    spine_ids.append(sid)
        
        if not spine_ids:
            flash('EPUB has no readable content in its spine.')
            return redirect(url_for('main.index'))

        toc_list = get_toc_list(book, spine_ids)
        total_items = len(spine_ids)

        if not (0 <= item_index < total_items):
            flash('Invalid chapter index.')
            # Use blueprint naming for url_for within the same blueprint
            return redirect(url_for('.read_item', book_id=book_id, item_index=0))

        item_id_from_spine = spine_ids[item_index]
        item = book.get_item_with_id(item_id_from_spine)

        if not item or (item.get_type() != ebooklib.ITEM_DOCUMENT and item.get_type() != ebooklib.ITEM_IMAGE):
             flash('Error: Could not find or access the requested content (not a document or image type).')
             return redirect(url_for('main.index'))

        raw_content = item.get_content()

        if item.get_type() == ebooklib.ITEM_IMAGE:
            current_app.logger.debug(f"Serving direct image item: {item.file_name or 'Unknown filename'} with media type: {item.media_type}")
            return Response(raw_content, mimetype=item.media_type)

        soup = BeautifulSoup(raw_content, 'lxml')
        current_item_dir = posixpath.dirname(item.file_name or "")
        
        # Rewrite image paths
        for tag in soup.find_all(["img", "image"]):
            original_src_val = None
            src_attr_to_update = None
            if tag.name == 'img':
                 original_src_val = tag.get('src')
                 src_attr_to_update = 'src'
            elif tag.name == 'image':
                 if tag.has_attr('xlink:href'):
                     original_src_val = tag.get('xlink:href')
                     src_attr_to_update = 'xlink:href'
                 elif tag.has_attr('href'):
                     original_src_val = tag.get('href')
                     src_attr_to_update = 'href'

            if original_src_val and src_attr_to_update:
                absolute_image_path = posixpath.normpath(posixpath.join(current_item_dir, original_src_val))
                # Use blueprint naming for url_for
                new_image_url = url_for('.serve_epub_image', book_id=book_id, image_href=absolute_image_path)
                tag[src_attr_to_update] = new_image_url
            elif original_src_val:
                 current_app.logger.warning(f"Found image tag {tag.name} with source but could not determine src attribute to update: {original_src_val}")

        # Clean up content
        for script_tag in soup.find_all('script'):
            script_tag.decompose()
        for link_tag in soup.find_all('link', rel='stylesheet'):
            link_tag.decompose()

        chapter_title_tag = soup.find(['h1', 'h2', 'h3', 'title'])
        current_chapter_title = chapter_title_tag.string if chapter_title_tag else "Chapter"

        body_content = soup.body if soup.body else soup
        processed_content = str(body_content)

        book_title_meta = book.get_metadata('DC', 'title')
        book_title = book_title_meta[0][0] if book_title_meta and book_title_meta[0] else "EPUB Book"
        
        prev_index = item_index - 1 if item_index > 0 else None
        next_index = item_index + 1 if item_index < len(spine_ids) - 1 else None
        
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
                               model_name=current_app.config.get('SERVER_DEFAULT_MODEL', 'gpt-4o-mini'),
                               show_jlpt_filter=session.get('show_jlpt_filter', False),
                               jlpt_enabled=session.get('jlpt_highlighting_enabled', False),
                               openai_key_configured=bool(current_app.config.get('OPENAI_API_KEY'))
                               )

    except FileNotFoundError:
        flash(f'Book file not found for ID: {book_id}. It might have been deleted.')
        return redirect(url_for('main.index'))
    except Exception as e:
        current_app.logger.error(f"Error reading item {item_index} for book {book_id}: {e}", exc_info=True)
        flash(f'An error occurred while trying to read the book content: {e}')
        return redirect(url_for('main.index'))


@reader_bp.route('/image/<book_id>/<path:image_href>')
def serve_epub_image(book_id, image_href):
    book_file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], book_id, 'book.epub')

    if not os.path.exists(book_file_path):
        current_app.logger.error(f"Error: EPUB file not found for book_id {book_id}: {book_file_path}")
        abort(404)

    try:
        book = epub.read_epub(book_file_path, options={"ignore_ncx": True})
        normalized_href = posixpath.normpath(image_href)
        image_item = book.get_item_with_href(normalized_href)

        if image_item:
            image_data = image_item.get_content()
            mime_type, _ = mimetypes.guess_type(normalized_href)
            if not mime_type:
                 if normalized_href.lower().endswith(('.jpg', '.jpeg')): mime_type = 'image/jpeg'
                 elif normalized_href.lower().endswith('.png'): mime_type = 'image/png'
                 elif normalized_href.lower().endswith('.gif'): mime_type = 'image/gif'
                 elif normalized_href.lower().endswith('.svg'): mime_type = 'image/svg+xml'
                 else: mime_type = 'application/octet-stream'

            current_app.logger.debug(f"Serving image for book {book_id}: {normalized_href} with MIME type: {mime_type}")
            return Response(image_data, mimetype=mime_type)
        else:
            current_app.logger.error(f"Error: Image item not found in EPUB for book {book_id}: {normalized_href}")
            abort(404)

    except Exception as e:
        current_app.logger.error(f"Error serving image {image_href} for book {book_id} from {book_file_path}: {e}", exc_info=True)
        abort(500) 