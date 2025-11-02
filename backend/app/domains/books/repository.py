from __future__ import annotations

from typing import List, Optional
from ...models import db, Bookmark as BookmarkModel
from .schemas import Book, Bookmark


class BooksRepository:
    def list_books(self) -> List[Book]:
        # Placeholder; real implementation will query DB or storage map
        return []

    def get_bookmarks(self, book_id: str, user_id: Optional[str] = None) -> List[Bookmark]:
        """Get bookmarks for a book, optionally filtered by user."""
        query = BookmarkModel.query.filter_by(book_id=book_id)
        if user_id:
            query = query.filter_by(user_id=user_id)
        bookmarks = query.order_by(BookmarkModel.created_at).all()
        return [
            Bookmark(
                id=b.id,
                bookId=b.book_id,
                chapterIndex=b.chapter_index,
                position=b.position,
                note=b.note,
                createdAt=b.created_at.isoformat() if b.created_at else None,
            )
            for b in bookmarks
        ]

    def add_bookmark(
        self,
        book_id: str,
        chapter_index: int,
        position: int,
        note: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Bookmark:
        """Create a bookmark."""
        bookmark = BookmarkModel(
            user_id=user_id,
            book_id=book_id,
            chapter_index=chapter_index,
            position=position,
            note=note,
        )
        db.session.add(bookmark)
        db.session.commit()
        return Bookmark(
            id=bookmark.id,
            bookId=bookmark.book_id,
            chapterIndex=bookmark.chapter_index,
            position=bookmark.position,
            note=bookmark.note,
            createdAt=bookmark.created_at.isoformat() if bookmark.created_at else None,
        )

