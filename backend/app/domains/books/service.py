from __future__ import annotations

from typing import List, Optional

from .ports import BooksRepositoryPort, StorageProviderPort, CoverLookupPort
from .schemas import Book, Bookmark


class BooksService:
    def __init__(self, repository: BooksRepositoryPort, storage: StorageProviderPort, cover_lookup: CoverLookupPort) -> None:
        self._repo = repository
        self._storage = storage
        self._cover_lookup = cover_lookup

    def list_books(self) -> List[Book]:
        # In future: merge DB metadata with storage presence
        return self._storage.list_books()

    def lookup_cover_bytes(self, title: str) -> tuple[bytes, str] | None:
        return self._cover_lookup.lookup_cover_bytes(title)

    def get_bookmarks(self, book_id: str, user_id: Optional[str] = None) -> List[Bookmark]:
        """Get bookmarks for a book."""
        return self._repo.get_bookmarks(book_id=book_id, user_id=user_id)

    def add_bookmark(
        self,
        book_id: str,
        chapter_index: int,
        position: int,
        note: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Bookmark:
        """Create a bookmark."""
        return self._repo.add_bookmark(
            book_id=book_id,
            chapter_index=chapter_index,
            position=position,
            note=note,
            user_id=user_id,
        )
