"""Database models for the application."""
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin

# SQLAlchemy instance used across the application

db = SQLAlchemy()


class User(UserMixin, db.Model):
    """Simple user model for authentication."""
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=True)
    password_hash = db.Column(db.String(128), nullable=True)


class Bookmark(db.Model):
    """Bookmark for tracking reading position per book and user."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    book_id = db.Column(db.String(255), nullable=False)
    chapter_index = db.Column(db.Integer, nullable=False)
    position = db.Column(db.Integer, nullable=False)
    note = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    user = db.relationship("User", backref="bookmarks")
