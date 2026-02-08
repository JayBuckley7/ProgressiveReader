from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional


class Book(BaseModel):
    id: str
    title: str
    fileType: Optional[str] = None
    driveFileId: Optional[str] = None
    filename: Optional[str] = None
    source: Optional[str] = None
    path: Optional[str] = None


class Bookmark(BaseModel):
    id: int | str
    bookId: str
    chapterIndex: int
    position: int
    note: Optional[str] = None
    createdAt: Optional[str] = None


class GetBookmarksRequest(BaseModel):
    bookId: str = Field(..., description="Book ID to fetch bookmarks for")


class AddBookmarkRequest(BaseModel):
    bookId: str
    chapterIndex: int
    position: int
    note: Optional[str] = None


class ToggleJlptRequest(BaseModel):
    """Request schema for toggling JLPT highlighting."""
    enabled: bool


class ToggleJlptResponse(BaseModel):
    """Response schema for JLPT toggle."""
    success: bool
    jlpt_highlighting_enabled: bool
