"""Cloud Run worker that indexes Google Drive files.

This module provides a minimal stub illustrating how a Cloud Run job could
fetch an EPUB file from Google Drive, extract metadata, and store that
metadata in Redis. It purposely discards file content after processing to
avoid hosting any user files.
"""

from __future__ import annotations

import io
import json
import logging
from typing import Dict

import redis
from ebooklib import epub
from bs4 import BeautifulSoup


def extract_epub_metadata(epub_bytes: bytes) -> Dict[str, object]:
    """Extract basic metadata from an EPUB file.

    Parameters
    ----------
    epub_bytes: bytes
        Raw bytes of the EPUB file.

    Returns
    -------
    Dict[str, object]
        Dictionary containing the title and word count.
    """
    book = epub.read_epub(io.BytesIO(epub_bytes))
    title_entries = book.get_metadata("DC", "title")
    title = title_entries[0][0] if title_entries else "Unknown Title"

    word_count = 0
    for item in book.get_items():
        if item.get_type() == epub.ITEM_DOCUMENT:
            html = item.get_content()
            soup = BeautifulSoup(html, "lxml")
            text = soup.get_text(" ")
            word_count += len(text.split())

    return {"title": title, "word_count": word_count}


def push_metadata(user_id: str, book_id: str, metadata: Dict[str, object],
                  redis_url: str) -> None:
    """Store metadata in Redis under namespaced keys."""
    r = redis.Redis.from_url(redis_url)
    key_list = f"user:{user_id}:books"
    key_book = f"user:{user_id}:book:{book_id}"

    existing_raw = r.get(key_list)
    books = json.loads(existing_raw) if existing_raw else []
    replaced = False
    for idx, entry in enumerate(books):
        if entry.get("id") == book_id:
            books[idx] = metadata
            replaced = True
            break
    if not replaced:
        books.append(metadata)
    r.set(key_list, json.dumps(books))
    r.set(key_book, json.dumps(metadata))


def process_drive_file(user_id: str, file_id: str, oauth_token: str,
                        redis_url: str) -> None:
    """Placeholder for Drive download and metadata extraction."""
    logging.info("Pretend to download %s for user %s", file_id, user_id)
    # NOTE: Do not download file content. This respects the privacy contract.
    # This is a stub. In production the file would be streamed from Drive.
    epub_bytes = b""  # Replace with actual download
    metadata = extract_epub_metadata(epub_bytes)
    metadata["id"] = file_id
    push_metadata(user_id, file_id, metadata, redis_url)

