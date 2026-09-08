"""
Clerk authentication middleware for Flask (delegates to Auth domain).
"""
from functools import wraps
from flask import request, jsonify, g, current_app
import logging

logger = logging.getLogger(__name__)

def get_auth_service():
    """Return the singleton AuthService instance used by auth decorators/routes."""
    injected = current_app.extensions.get("auth_service")
    if injected is not None:
        return injected
    container = current_app.extensions.get("container")
    if container is None:
        raise RuntimeError("Auth container not initialized")
    service = getattr(container, "auth_service", None)
    if service is None:
        raise RuntimeError("Auth service not configured")
    return service


def get_current_user():
    """Get the current user from request headers (domain user shape)."""
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

        logger.debug("[auth] require_auth called for %s", f.__name__)
        user = get_current_user()
        if not user:
            logger.warning("[auth] Authentication failed for %s; returning 401", f.__name__)
            return jsonify({"code": "AUTH_REQUIRED", "error": "Sign in to continue."}), 401
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

        user = get_current_user()
        if not user:
            return jsonify({"code": "AUTH_REQUIRED", "error": "Sign in to continue."}), 401
        if not is_progressive_reader_admin(user.id):
            return jsonify({"error": "Forbidden"}), 403
        g.user = user
        return f(*args, **kwargs)
    return decorated_function


def optional_auth(f):
    """Decorator to optionally authenticate (user might be None)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
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
        # Prefer normalized domain user shape (UserInfo.email).
        if hasattr(g.user, "email") and getattr(g.user, "email", None):
            return g.user.email
        # Backwards compatibility: raw Clerk user shape.
        if hasattr(g.user, 'email_addresses') and g.user.email_addresses and len(g.user.email_addresses) > 0:
            return getattr(g.user.email_addresses[0], "email_address", None)
    return None
