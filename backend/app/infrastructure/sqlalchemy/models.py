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


__all__ = ["Bookmark", "Vocabulary"]

