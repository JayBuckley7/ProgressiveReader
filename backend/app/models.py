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
