"""Backward-compatible re-exports for ORM objects.

Prefer importing from `app.infrastructure.sqlalchemy` in new code.
"""

from __future__ import annotations

from .infrastructure.sqlalchemy.db import db
from .infrastructure.sqlalchemy.models import Bookmark, OcrPageLayoutCache, Vocabulary

__all__ = ["db", "Bookmark", "Vocabulary", "OcrPageLayoutCache"]

