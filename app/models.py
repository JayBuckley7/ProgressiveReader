"""Database models for the application."""
from flask_sqlalchemy import SQLAlchemy

# SQLAlchemy instance used across the application

db = SQLAlchemy()


class User(db.Model):
    """Simple user model for authentication."""
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
