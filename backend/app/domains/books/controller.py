"""Inbound controller for books routes (keeps Flask routes thin)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, MutableMapping, Optional

from .schemas import (
    GetBookmarksRequest,
    AddBookmarkRequest,
    ToggleJlptRequest,
    ToggleJlptResponse,
)
from .service import BooksService


@dataclass(frozen=True)
class BooksController:
    books_service: BooksService

    def get_bookmarks(self, *, book_id: str, user_id: Optional[str]) -> list[dict]:
        req = GetBookmarksRequest(bookId=book_id)
        bookmarks = self.books_service.get_bookmarks(book_id=req.bookId, user_id=user_id)
        return [b.model_dump() for b in bookmarks]

    def add_bookmark(self, *, payload: dict[str, Any], user_id: Optional[str]) -> dict:
        req = AddBookmarkRequest(**payload)
        bookmark = self.books_service.add_bookmark(
            book_id=req.bookId,
            chapter_index=req.chapterIndex,
            position=req.position,
            note=req.note,
            user_id=user_id,
        )
        return bookmark.model_dump()

    def toggle_jlpt(self, *, payload: dict[str, Any], session_store: MutableMapping[str, Any]) -> ToggleJlptResponse:
        req = ToggleJlptRequest(**payload)
        session_store["jlpt_highlighting_enabled"] = req.enabled
        return ToggleJlptResponse(success=True, jlpt_highlighting_enabled=req.enabled)


__all__ = ["BooksController"]
