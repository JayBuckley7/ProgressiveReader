"""Helpers for verifying Firebase ID tokens."""
from __future__ import annotations

import firebase_admin
from firebase_admin import auth, credentials
from flask import current_app


_default_app = None


def _initialize_firebase() -> None:
    """Initialize the Firebase app if it hasn't been already."""
    global _default_app
    if not firebase_admin._apps:
        cred_path = current_app.config.get("FIREBASE_CREDENTIALS")
        if cred_path:
            cred = credentials.Certificate(cred_path)
        else:
            cred = credentials.ApplicationDefault()
        _default_app = firebase_admin.initialize_app(cred)


def verify_firebase_token(id_token: str) -> dict | None:
    """Return the decoded Firebase token or ``None`` if invalid."""
    if not id_token:
        return None

    _initialize_firebase()
    try:
        return auth.verify_id_token(id_token)
    except Exception as exc:  # noqa: broad-except
        current_app.logger.error("Failed to verify Firebase token: %s", exc)
        return None

from functools import wraps
from flask import request, jsonify
from flask_login import current_user, login_user

from ..models import User, db


def firebase_token_or_login_required(func):
    """Decorator allowing access via Firebase token or session login."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                decoded = verify_firebase_token(auth_header.split(" ", 1)[1])
                if decoded:
                    email = decoded.get("email")
                    if email:
                        user = User.query.filter_by(email=email).first()
                        if not user:
                            user = User(email=email)
                            db.session.add(user)
                            db.session.commit()
                        login_user(user)
        if not current_user.is_authenticated:
            return jsonify({'error': 'Auth required'}), 401
        return func(*args, **kwargs)

    return wrapper
