from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Literal, Optional


class Book(BaseModel):
    id: str
    title: str
    fileType: Optional[str] = None
    driveFileId: Optional[str] = None
    filename: Optional[str] = None
    source: Optional[str] = None
    path: Optional[str] = None


class ReaderLocator(BaseModel):
    """Versioned, stable reading location for reflowable books and PDFs."""

    model_config = ConfigDict(extra="ignore")

    version: Literal[2]
    kind: Literal["reflow", "pdf"]
    chapterIndex: Optional[int] = None
    segmentId: Optional[str] = Field(default=None, min_length=1)
    textOffset: Optional[int] = None
    quote: Optional[str] = None
    progression: Optional[float] = None
    pageNumber: Optional[int] = None

    @model_validator(mode="after")
    def validate_kind_fields(self) -> "ReaderLocator":
        if self.kind == "reflow":
            required = ("chapterIndex", "segmentId", "textOffset", "progression")
        else:
            required = ("pageNumber",)

        missing = [field for field in required if getattr(self, field) is None]
        if missing:
            raise ValueError(f"{self.kind} locator requires {', '.join(missing)}")
        return self


class Bookmark(BaseModel):
    id: int | str
    bookId: str
    chapterIndex: int
    position: int
    note: Optional[str] = None
    createdAt: Optional[str] = None
    locator: Optional[ReaderLocator] = None


class GetBookmarksRequest(BaseModel):
    bookId: str = Field(..., description="Book ID to fetch bookmarks for")


class AddBookmarkRequest(BaseModel):
    bookId: str
    chapterIndex: int
    position: int
    note: Optional[str] = None
    locator: Optional[ReaderLocator] = None


class ToggleJlptRequest(BaseModel):
    """Request schema for toggling JLPT highlighting."""
    enabled: bool


class ToggleJlptResponse(BaseModel):
    """Response schema for JLPT toggle."""
    success: bool
    jlpt_highlighting_enabled: bool
