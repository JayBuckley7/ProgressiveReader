"""SQLAlchemy infrastructure (ORM + session)."""

from .db import db
from .models import Bookmark, Vocabulary

__all__ = ["db", "Bookmark", "Vocabulary"]

