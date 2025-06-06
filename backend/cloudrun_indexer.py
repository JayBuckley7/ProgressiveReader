"""Cloud Run worker that indexes Google Drive files.

This module provides a minimal stub illustrating how a Cloud Run job could
fetch an EPUB file from Google Drive, extract metadata, and store that
metadata in Firestore. It purposely discards file content after processing to
avoid hosting any user files.
"""

from __future__ import annotations

import io
import json
import logging
from typing import Dict
import functions_framework
import os
from datetime import datetime, timezone
from google.cloud import firestore
from google.cloud import storage
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Firestore client
# db = firestore.Client(database="(default)") # For default database
db = firestore.Client(database=os.environ.get("FIRESTORE_DATABASE_ID", "(default)"))

# Initialize Cloud Storage client
storage_client = storage.Client()

@functions_framework.http
def index_drive_files(request):
    request_json = request.get_json(silent=True)
    logger.info(f"Received request: {request_json}")

    if not request_json or 'user_id' not in request_json or 'drive_creds' not in request_json:
        logger.error("Missing user_id or drive_creds in request")
        return 'Missing user_id or drive_creds', 400

    user_id = request_json['user_id']
    # We are not using drive_creds directly in this version, but it's good to receive it for future use.
    # drive_creds_json = request_json['drive_creds'] 

    try:
        # Instead of listing Drive files, we will now expect a list of file IDs and metadata from the client.
        # This is a placeholder for where you would integrate with your file storage/management system.
        # For now, we'll assume the client sends the necessary book metadata directly.
        if 'books' in request_json:
            books_data = request_json['books']
            for book_data in books_data:
                book_id = book_data.get('id')
                if not book_id:
                    logger.warning("Skipping book with no ID")
                    continue

                # Use Firestore to store/update book metadata
                book_ref = db.collection('users').document(user_id).collection('books').document(book_id)
                
                # Prepare data for Firestore, ensuring all necessary fields are present
                firestore_book_data = {
                    'id': book_id,
                    'title': book_data.get('title', 'Untitled'),
                    'authors': book_data.get('authors', 'Unknown Author'),
                    'language': book_data.get('language', 'en'),
                    'last_modified_time': book_data.get('last_modified_time', datetime.now(timezone.utc).isoformat()),
                    'source': book_data.get('source', 'unknown'), # e.g., 'google_drive', 'local_upload'
                    # Add any other relevant metadata fields
                    'cover_image_path': book_data.get('cover_image_path'), # Optional
                    'current_chapter_index': book_data.get('current_chapter_index', 0),
                    'reading_position_in_chapter': book_data.get('reading_position_in_chapter', 0),
                    'last_read_timestamp': book_data.get('last_read_timestamp', datetime.now(timezone.utc).isoformat()),
                    'file_type': book_data.get('file_type')
                }
                # Remove None values to avoid issues with Firestore
                firestore_book_data = {k: v for k, v in firestore_book_data.items() if v is not None}

                book_ref.set(firestore_book_data, merge=True) # Use merge=True to update existing or create new
                logger.info(f"Processed and stored/updated metadata for book ID: {book_id} for user {user_id}")
        else:
            logger.info("No 'books' field in request, nothing to index.")

        return 'Metadata processing complete.', 200

    except Exception as e:
        logger.error(f"Error indexing files: {e}", exc_info=True)
        return f'Error: {e}', 500


# Helper function (example, not directly used by the main function above anymore for EPUB processing)
# This can be adapted for server-side EPUB metadata extraction if needed in the future.
def extract_epub_metadata(epub_path):
    try:
        book = epub.read_epub(epub_path)
        metadata = {
            'title': 'Unknown Title',
            'authors': 'Unknown Author',
            'language': 'en' # Default language
        }
        if book.get_metadata('DC', 'title'):
            metadata['title'] = book.get_metadata('DC', 'title')[0][0]
        if book.get_metadata('DC', 'creator'):
            authors = [author[0] for author in book.get_metadata('DC', 'creator')]
            metadata['authors'] = ", ".join(authors)
        if book.get_metadata('DC', 'language'):
            metadata['language'] = book.get_metadata('DC', 'language')[0][0]
        
        # Extract cover image (simplified)
        cover_item = None
        for item in book.get_items_of_type(ebooklib.ITEM_IMAGE):
            if 'cover' in item.get_name().lower(): # A common convention
                cover_item = item
                break
        if not cover_item and book.get_items_of_type(ebooklib.ITEM_COVER):
             cover_item = book.get_items_of_type(ebooklib.ITEM_COVER)[0]

        cover_image_path = None
        if cover_item:
            # In a real scenario, you'd save this to GCS and store the path
            # For now, just indicating presence
            cover_image_path = f"covers/{os.path.basename(epub_path)}_cover.jpg" 
            logger.info(f"Extracted cover info for {epub_path}: {cover_item.get_name()}")
            # storage_client.bucket(YOUR_BUCKET_NAME).blob(cover_image_path).upload_from_string(cover_item.get_content())

        metadata['cover_image_path'] = cover_image_path
        return metadata
    except Exception as e:
        logger.error(f"Error extracting EPUB metadata from {epub_path}: {e}", exc_info=True)
        return None

if __name__ == "__main__":
    # This section is for local testing and won't run in Cloud Run.
    # You would need to mock the `request` object or use `flask` to run it locally.
    # Example of how you might test:
    # from unittest.mock import MagicMock
    # mock_request = MagicMock()
    # mock_request.get_json.return_value = {
    #     'user_id': 'test-user',
    #     'drive_creds': {},
    #     'books': [
    #         {
    #             'id': 'book123',
    #             'title': 'Test Book Adventure',
    #             'authors': 'Author One, Author Two',
    #             'language': 'en',
    #             'last_modified_time': datetime.now(timezone.utc).isoformat(),
    #             'source': 'google_drive',
    #             'file_type': 'epub'
    #         }
    #     ]
    # }
    # print(index_drive_files(mock_request))
    logger.info("Local execution of cloudrun_indexer.py. This script is intended for Cloud Run deployment.")
    # For local testing, you might want to set GOOGLE_APPLICATION_CREDENTIALS
    # and FIRESTORE_DATABASE_ID environment variables.
    # Example: os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = 'path/to/your/creds.json'
    # os.environ['FIRESTORE_DATABASE_ID'] = 'your-firestore-db-id'

    # Simulate a call if needed for basic startup test
    class MockRequest:
        def get_json(self, silent=False):
            return {
                'user_id': 'local-test-user',
                'drive_creds': 'mock_creds', # Not used in this simplified version
                'books': [
                    {
                        'id': 'localbook1',
                        'title': 'My Local Test Book',
                        'authors': 'Tester McTestFace',
                        'language': 'en',
                        'last_modified_time': datetime.now(timezone.utc).isoformat(),
                        'source': 'local_test',
                        'file_type': 'txt'
                    }
                ]
            }

    logger.info(index_drive_files(MockRequest()))

