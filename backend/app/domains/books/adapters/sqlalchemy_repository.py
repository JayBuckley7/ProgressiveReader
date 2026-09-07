from __future__ import annotations

import json
from typing import List, Optional, Any

from ....infrastructure.sqlalchemy.models import Bookmark as BookmarkModel
from ..ports import BooksRepositoryPort
from ..schemas import Bookmark, ReaderLocator


def _decode_locator(raw: Optional[str]) -> Optional[ReaderLocator]:
    if not raw:
        return None
    try:
        return ReaderLocator.model_validate(json.loads(raw))
    except (TypeError, ValueError):
        # A malformed optional locator must not make older bookmark rows unreadable.
        return None


def _to_bookmark(bookmark: BookmarkModel) -> Bookmark:
    return Bookmark(
        id=bookmark.id,
        bookId=bookmark.book_id,
        chapterIndex=bookmark.chapter_index,
        position=bookmark.position,
        note=bookmark.note,
        createdAt=bookmark.created_at.isoformat() if bookmark.created_at else None,
        locator=_decode_locator(getattr(bookmark, "locator_json", None)),
    )


class SqlAlchemyBooksRepository(BooksRepositoryPort):
    def __init__(self, session: Any) -> None:
        self._session = session

    def get_bookmarks(self, book_id: str, user_id: Optional[str] = None) -> List[Bookmark]:
        """Get bookmarks for a book, optionally filtered by user."""
        query = self._session.query(BookmarkModel).filter_by(book_id=book_id)
        if user_id:
            query = query.filter_by(user_id=user_id)
        bookmarks = query.order_by(BookmarkModel.created_at).all()
        return [_to_bookmark(bookmark) for bookmark in bookmarks]

    def add_bookmark(
        self,
        book_id: str,
        chapter_index: int,
        position: int,
        note: Optional[str] = None,
        user_id: Optional[str] = None,
        locator: Optional[ReaderLocator] = None,
    ) -> Bookmark:
        """Create a bookmark."""
        bookmark = BookmarkModel(
            user_id=user_id,
            book_id=book_id,
            chapter_index=chapter_index,
            position=position,
            note=note,
            locator_json=(
                json.dumps(locator.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":"))
                if locator is not None
                else None
            ),
        )
        self._session.add(bookmark)
        self._session.commit()
        return _to_bookmark(bookmark)


__all__ = ["SqlAlchemyBooksRepository"]
