"""SQLAlchemy extension instance (framework/infrastructure layer)."""

from __future__ import annotations

from flask_sqlalchemy import SQLAlchemy

# Flask-SQLAlchemy extension instance (initialized in app factory).
db = SQLAlchemy()

__all__ = ["db"]

