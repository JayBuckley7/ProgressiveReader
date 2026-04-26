"""SQLAlchemy ORM models (infrastructure layer)."""

from __future__ import annotations

from .db import db


class Bookmark(db.Model):
    """Bookmark for tracking reading position per book and user."""

    id = db.Column(db.Integer, primary_key=True)
    # Clerk user IDs are strings, so store directly without a foreign key
    user_id = db.Column(db.String(255), nullable=True)
    book_id = db.Column(db.String(255), nullable=False)
    chapter_index = db.Column(db.Integer, nullable=False)
    position = db.Column(db.Integer, nullable=False)
    note = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, server_default=db.func.now())


class Vocabulary(db.Model):
    """Vocabulary word for user's collection."""

    id = db.Column(db.Integer, primary_key=True)
    # Clerk user IDs are strings, so store directly without a foreign key
    user_id = db.Column(db.String(255), nullable=True)
    word = db.Column(db.String(255), nullable=False)
    translation = db.Column(db.String(255), nullable=False)
    language = db.Column(db.String(50), nullable=False, default="English")
    book_id = db.Column(db.String(255))
    context = db.Column(db.Text)
    difficulty = db.Column(db.String(20))
    mastered = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())


class OcrPageLayoutCache(db.Model):
    """Persistent OCR layout cache keyed by page-image content hash."""

    id = db.Column(db.Integer, primary_key=True)
    content_hash = db.Column(db.String(64), nullable=False)
    ocr_profile = db.Column(db.String(64), nullable=False, default="ja-pdf-overlay-v1")
    document_id = db.Column(db.String(255), nullable=True)
    document_version = db.Column(db.String(255), nullable=True)
    page_index = db.Column(db.Integer, nullable=False, default=0)
    image_width = db.Column(db.Integer, nullable=False)
    image_height = db.Column(db.Integer, nullable=False)
    layout_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    last_accessed_at = db.Column(db.DateTime, server_default=db.func.now(), onupdate=db.func.now())

    __table_args__ = (
        db.UniqueConstraint("content_hash", "ocr_profile", name="uq_ocr_page_layout_cache_hash_profile"),
    )


__all__ = ["Bookmark", "Vocabulary", "OcrPageLayoutCache"]

