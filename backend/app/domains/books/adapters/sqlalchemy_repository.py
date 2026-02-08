from __future__ import annotations

from typing import List, Optional, Any

from ....infrastructure.sqlalchemy.models import Bookmark as BookmarkModel
from ..ports import BooksRepositoryPort
from ..schemas import Bookmark


class SqlAlchemyBooksRepository(BooksRepositoryPort):
    def __init__(self, session: Any) -> None:
        self._session = session

    def get_bookmarks(self, book_id: str, user_id: Optional[str] = None) -> List[Bookmark]:
        """Get bookmarks for a book, optionally filtered by user."""
        query = self._session.query(BookmarkModel).filter_by(book_id=book_id)
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
        self._session.add(bookmark)
        self._session.commit()
        return Bookmark(
            id=bookmark.id,
            bookId=bookmark.book_id,
            chapterIndex=bookmark.chapter_index,
            position=bookmark.position,
            note=bookmark.note,
            createdAt=bookmark.created_at.isoformat() if bookmark.created_at else None,
        )


__all__ = ["SqlAlchemyBooksRepository"]
