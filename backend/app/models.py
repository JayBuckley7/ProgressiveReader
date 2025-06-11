"""Database models for the application."""
from flask_sqlalchemy import SQLAlchemy
# SQLAlchemy instance used across the application

db = SQLAlchemy()


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

