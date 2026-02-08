from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from .schemas import Book, Bookmark


class BooksRepositoryPort(ABC):
    """Port for persistence of book-related user data (ex: bookmarks)."""

    @abstractmethod
    def get_bookmarks(self, book_id: str, user_id: Optional[str] = None) -> List[Bookmark]:
        raise NotImplementedError

    @abstractmethod
    def add_bookmark(
        self,
        book_id: str,
        chapter_index: int,
        position: int,
        note: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Bookmark:
        raise NotImplementedError


class StorageProviderPort(ABC):
    @abstractmethod
    def list_books(self) -> List[Book]:
        raise NotImplementedError


class CoverLookupPort(ABC):
    @abstractmethod
    def lookup_cover_bytes(self, title: str) -> tuple[bytes, str] | None:
        raise NotImplementedError


__all__ = ["BooksRepositoryPort", "StorageProviderPort", "CoverLookupPort"]
