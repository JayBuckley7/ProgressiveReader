import os
import json
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup # For simple HTML cleaning if needed later
import posixpath

# From your app.py_OLD, slightly adapted
def get_toc_list_from_book(book_obj, spine_ids_list):
    toc_data = []
    spine_file_to_index_map = {}
    for index, item_id_in_spine in enumerate(spine_ids_list):
        item_from_spine = book_obj.get_item_with_id(item_id_in_spine)
        if item_from_spine and item_from_spine.file_name:
            base_filename = item_from_spine.file_name.split('#')[0]
            if base_filename not in spine_file_to_index_map:
                spine_file_to_index_map[base_filename] = index

    def process_toc_item_recursive(toc_item_obj):
        if isinstance(toc_item_obj, ebooklib.epub.Link):
            href_base = toc_item_obj.href.split('#')[0]
            if href_base in spine_file_to_index_map:
                item_idx = spine_file_to_index_map[href_base]
                toc_data.append({
                    'title': toc_item_obj.title or "(No Title)",
                    'index': item_idx, 
                    'href': toc_item_obj.href
                })
        elif isinstance(toc_item_obj, ebooklib.epub.Section):
            # Process section link itself if it has one and maps to spine
            if toc_item_obj.href: # Sections can also be direct links
                href_base = toc_item_obj.href.split('#')[0]
                if href_base in spine_file_to_index_map:
                    item_idx = spine_file_to_index_map[href_base]
                    # Check if this exact section (by href) is already added to avoid dups from child processing
                    # This simple check might not be perfect for all ToC structures but helps.
                    is_already_added = any(entry['href'] == toc_item_obj.href and entry['index'] == item_idx for entry in toc_data)
                    if not is_already_added:
                        toc_data.append({
                            'title': toc_item_obj.title or "(Section Title)",
                            'index': item_idx,
                            'href': toc_item_obj.href
                        })
            
            # Recurse for children of the section, if they exist
            if hasattr(toc_item_obj, 'children') and toc_item_obj.children:
                for child in toc_item_obj.children:
                    process_toc_item_recursive(child)

        elif isinstance(toc_item_obj, tuple) and len(toc_item_obj) > 0:
            # This handles ToC structures like (Section, [child1, child2])
            # or (Link, [irrelevant_child_list_if_any])
            if isinstance(toc_item_obj[0], (ebooklib.epub.Section, ebooklib.epub.Link)):
                process_toc_item_recursive(toc_item_obj[0])
            
            # If the first element was a Section, its children would have been processed by the hasattr check above.
            # If the ToC structure is strictly (Section_Object_itself_linking, list_of_children_for_that_section),
            # we need to be careful not to double-process. The current Section processing tries to handle both.
            # For tuple (Link, [...]), we typically only care about the Link itself.
            # For tuple (Section_that_does_not_link, [children_that_do_link]), we process children.
            if isinstance(toc_item_obj[0], ebooklib.epub.Section) and not toc_item_obj[0].href and \
               len(toc_item_obj) > 1 and isinstance(toc_item_obj[1], list):
                for child_item_in_list in toc_item_obj[1]:
                    process_toc_item_recursive(child_item_in_list)
            elif isinstance(toc_item_obj[0], ebooklib.epub.Link) and \
                 len(toc_item_obj) > 1 and isinstance(toc_item_obj[1], list):
                # If it's a Link followed by a list of sub-items (less common but possible for some ToCs)
                for child_item_in_list in toc_item_obj[1]:
                    process_toc_item_recursive(child_item_in_list)

    if hasattr(book_obj, 'toc') and book_obj.toc:
        for root_toc_item in book_obj.toc:
            process_toc_item_recursive(root_toc_item)
    
    # Deduplicate based on index and href, keeping first encountered
    seen_hrefs_for_index = {}
    unique_toc_data = []
    for entry in toc_data:
        # Normalize href for comparison (remove fragment for uniqueness check if desired)
        # base_href_for_check = entry['href'].split('#')[0]
        # key = (entry['index'], base_href_for_check) 
        key = (entry['index'], entry['href']) # Stricter: exact href and index must be unique
        if key not in seen_hrefs_for_index:
            unique_toc_data.append(entry)
            seen_hrefs_for_index[key] = True
            
    unique_toc_data.sort(key=lambda x: x['index']) # Ensure sorted by spine index
    return unique_toc_data

def extract_epub_data(epub_file_path, output_dir="ground_truth_data"):
    if not os.path.exists(epub_file_path):
        print(f"Error: EPUB file not found at {epub_file_path}")
        return

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    book = epub.read_epub(epub_file_path, options={"ignore_ncx": False})

    # 1. Extract Metadata
    metadata = {
        "title": "Unknown Title",
        "authors": [],
        "language": "en" # Default
    }
    title_meta = book.get_metadata('DC', 'title')
    if title_meta: metadata["title"] = title_meta[0][0]

    authors_meta = book.get_metadata('DC', 'creator')
    if authors_meta: metadata["authors"] = [author[0] for author in authors_meta]

    lang_meta = book.get_metadata('DC', 'language')
    if lang_meta: metadata["language"] = lang_meta[0][0]
    
    # Add identifier
    identifier_meta = book.get_metadata('DC', 'identifier')
    if identifier_meta: metadata["identifier"] = identifier_meta[0][0]
    else: metadata["identifier"] = book.uid

    # 2. Prepare Spine Information (list of document item IDs)
    spine_item_ids = []
    if book.spine:
        for spine_entry_id, _ in book.spine:
            item = book.get_item_with_id(spine_entry_id)
            # Only include actual documents in our usable spine list
            if item and item.get_type() == ebooklib.ITEM_DOCUMENT:
                spine_item_ids.append(spine_entry_id)

    # 3. Extract Table of Contents (mapped to spine indices)
    toc_structure = get_toc_list_from_book(book, spine_item_ids)
    metadata["toc_processed"] = toc_structure
    metadata["spine_document_ids"] = spine_item_ids
    metadata["total_spine_documents"] = len(spine_item_ids)

    # Save metadata and ToC
    base_name = os.path.splitext(os.path.basename(epub_file_path))[0]
    metadata_file = os.path.join(output_dir, f"{base_name}_metadata_toc.json")
    with open(metadata_file, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=4)
    print(f"Saved metadata and ToC to: {metadata_file}")

    # 4. Extract HTML content for each document in the processed spine
    chapters_data = []
    for i, item_id in enumerate(spine_item_ids):
        item = book.get_item_with_id(item_id)
        if item:
            raw_content = item.get_content() # This is bytes
            try:
                # Try to decode as UTF-8, can add more robust decoding if needed
                html_content_str = raw_content.decode('utf-8') 
            except UnicodeDecodeError:
                # Fallback or error logging
                print(f"Warning: Could not decode chapter {i} (ID: {item_id}) as UTF-8. Skipping content extraction.")
                html_content_str = "<p>Error: Content could not be decoded.</p>"

            # Optional: Basic cleaning with BeautifulSoup (e.g., to get body content)
            # soup = BeautifulSoup(html_content_str, 'lxml')
            # body_content = str(soup.body) if soup.body else html_content_str
            body_content = html_content_str # For now, save the full raw decoded HTML

            chapter_output_file = os.path.join(output_dir, f"{base_name}_chapter_{i}_{item.id}.html")
            with open(chapter_output_file, 'w', encoding='utf-8') as f:
                f.write(body_content)
            print(f"Saved chapter {i} (ID: {item.id}, href: {item.file_name}) to: {chapter_output_file}")
            chapters_data.append({
                "spine_index": i,
                "item_id": item.id,
                "file_name": item.file_name,
                "output_file": chapter_output_file
            })
        else:
            print(f"Warning: Could not find item for spine ID {item_id} at index {i}")

    # Save chapter manifest
    chapters_manifest_file = os.path.join(output_dir, f"{base_name}_chapters_manifest.json")
    with open(chapters_manifest_file, 'w', encoding='utf-8') as f:
        json.dump(chapters_data, f, ensure_ascii=False, indent=4)
    print(f"Saved chapters manifest to: {chapters_manifest_file}")

if __name__ == '__main__':
    # Replace 'sample.epub' with the EPUB file you want to process
    # Ensure this EPUB file is in the same directory as the script, or provide a full path.
    epub_to_process = 'DCC1.epub'
    print(f"Processing {epub_to_process}...")
    extract_epub_data(epub_to_process)
    print("Processing complete.")

    # Example for another book:
    # epub_to_process_2 = 'sample.epub'
    # print(f"\nProcessing {epub_to_process_2}...")
    # extract_epub_data(epub_to_process_2)
    # print("Processing complete.") 
