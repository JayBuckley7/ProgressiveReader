import os
import ebooklib
from ebooklib import epub
from flask import current_app

def extract_and_save_cover(book_path, book_folder):
    """Reads an EPUB, extracts the cover image, and saves it to the book's folder.

    Args:
        book_path (str): The full path to the EPUB file.
        book_folder (str): The path to the directory where the cover should be saved.

    Returns:
        str or None: The filename of the saved cover image (e.g., 'cover.jpg') 
                     or None if no cover was found or saved.
    """
    cover_image_filename = None
    try:
        book = epub.read_epub(book_path)
        
        # --- Cover image extraction logic --- 
        cover_item = None
        # 1. Check standard ITEM_COVER type
        for item in book.get_items_of_type(ebooklib.ITEM_COVER):
            cover_item = item
            break
        
        # 2. Check metadata reference if not found yet
        if not cover_item:
            meta_cover_id = None
            for meta_el in getattr(book, 'opf_metadata', []):
                if meta_el.tag.endswith('meta') and meta_el.get('name') == 'cover':
                    meta_cover_id = meta_el.get('content')
                    break
            if meta_cover_id:
                cover_item = book.get_item_with_id(meta_cover_id)
        
        # 3. Check for deprecated 'properties="cover-image"' if still no cover
        if not cover_item:
            for item in book.get_items_of_type(ebooklib.ITEM_IMAGE):
                if hasattr(item, 'opf_item') and item.opf_item is not None and item.opf_item.get('properties') == 'cover-image':
                    cover_item = item
                    break
        
        # 4. Save the cover if found
        if cover_item and cover_item.get_content():
            _, ext = os.path.splitext(cover_item.get_name())
            # Guess extension from mimetype if missing
            if not ext and cover_item.get_media_type() == 'image/jpeg': ext = '.jpg'
            elif not ext and cover_item.get_media_type() == 'image/png': ext = '.png'
            elif not ext and cover_item.get_media_type() == 'image/gif': ext = '.gif'
            elif not ext and cover_item.get_media_type() == 'image/webp': ext = '.webp'
            elif not ext: ext = '.jpg' # Default fallback
            
            cover_image_filename = f"cover{ext}"
            cover_image_path = os.path.join(book_folder, cover_image_filename)
            with open(cover_image_path, 'wb') as cover_file:
                cover_file.write(cover_item.get_content())
            current_app.logger.info(f"Extracted cover image to {cover_image_path}")
        else:
            current_app.logger.info(f"No cover image found or extracted for book path: {book_path}")
        # --- End cover image extraction ---

    except Exception as e:
        current_app.logger.error(f"Error during cover extraction for {book_path}: {e}", exc_info=True)
        # Don't let cover extraction failure stop the upload process entirely
        cover_image_filename = None # Ensure None is returned on error
        
    return cover_image_filename 