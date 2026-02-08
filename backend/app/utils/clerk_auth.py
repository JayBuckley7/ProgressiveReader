"""
Clerk authentication middleware for Flask (delegates to Auth domain).
"""
from functools import wraps
from types import SimpleNamespace
from flask import request, jsonify, g, current_app
import logging

logger = logging.getLogger(__name__)

def _testing_user():
    # Minimal shape used by routes/tests: `id` and optionally `email_addresses`.
    return SimpleNamespace(id="test-user", email_addresses=[])

def get_auth_service():
    """Return the singleton AuthService instance used by auth decorators/routes."""
    container = current_app.extensions.get("container")
    if container is None:
        raise RuntimeError("Auth container not initialized")
    service = getattr(container, "auth_service", None)
    if service is None:
        raise RuntimeError("Auth service not configured")
    return service


def get_current_user():
    """Get the current user from request headers (raw Clerk user for compatibility)."""
    try:
        user = get_auth_service().get_current_user_from_headers(dict(request.headers))
        if user:
            logger.debug("User authenticated: %s", user.id)
        else:
            logger.warning("Authentication failed (no user returned)")
        return user
    except Exception as e:  # pragma: no cover - hard to simulate in unit tests
        logger.error(f"Unexpected error during authentication: {e}", exc_info=True)
        return None


def require_auth(f):
    """Decorator to require authentication for a route"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if current_app.config.get("TESTING"):
            g.user = _testing_user()
            return f(*args, **kwargs)

        logger.debug("[auth] require_auth called for %s", f.__name__)
        user = get_current_user()
        if not user:
            logger.warning("[auth] Authentication failed for %s; returning 401", f.__name__)
            return jsonify({"error": "Authentication required"}), 401
        logger.debug("[auth] Authentication successful for %s; user=%s", f.__name__, user.id)
        g.user = user
        return f(*args, **kwargs)
    return decorated_function


def is_progressive_reader_admin(user_id: str) -> bool:
    """Check ProgressiveReader admin membership via provider."""
    return get_auth_service().is_admin(user_id)


def require_admin(f):
    """Decorator to require ProgressiveReader admin role."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if current_app.config.get("TESTING"):
            g.user = _testing_user()
            return f(*args, **kwargs)

        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        if not is_progressive_reader_admin(user.id):
            return jsonify({"error": "Forbidden"}), 403
        g.user = user
        return f(*args, **kwargs)
    return decorated_function


def optional_auth(f):
    """Decorator to optionally authenticate (user might be None)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if current_app.config.get("TESTING"):
            g.user = _testing_user()
            return f(*args, **kwargs)
        g.user = get_current_user()
        return f(*args, **kwargs)
    return decorated_function


def get_user_id():
    """Helper function to get the current user's ID"""
    if hasattr(g, 'user') and g.user:
        return g.user.id
    return None


def get_user_email():
    """Helper function to get the current user's primary email"""
    if hasattr(g, 'user') and g.user:
        # Clerk stores emails in email_addresses array
        if hasattr(g.user, 'email_addresses') and g.user.email_addresses and len(g.user.email_addresses) > 0:
            return g.user.email_addresses[0].email_address
    return None
