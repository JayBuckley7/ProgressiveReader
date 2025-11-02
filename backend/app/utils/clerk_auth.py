"""
Clerk authentication middleware for Flask (delegates to Auth domain).
"""
import os
from functools import wraps
from flask import request, jsonify, g
import logging

from app.domains.auth.integrations import ClerkAuthProvider
from app.domains.auth.service import AuthService

logger = logging.getLogger(__name__)

# Initialize domain provider + service and expose raw clerk client for debug routes
# Use lazy initialization to ensure env.json is loaded first
_provider = None
auth_service = None
clerk = None

def _ensure_provider_initialized():
    """Lazy initialization of Clerk provider to ensure env.json is loaded."""
    global _provider, auth_service, clerk
    if _provider is None:
        secret_key = os.getenv("CLERK_SECRET_KEY")
        logger.debug(f"🔐 [AUTH INIT] Initializing Clerk provider, secret_key present: {bool(secret_key)}")
        if secret_key:
            logger.debug(f"🔐 [AUTH INIT] Secret key preview: {secret_key[:20]}...")
        _provider = ClerkAuthProvider(secret_key=secret_key)
        auth_service = AuthService(_provider)
        clerk = getattr(_provider, "client", None)
        logger.debug(f"🔐 [AUTH INIT] Provider initialized, client present: {bool(clerk)}")
    return _provider, auth_service


def get_current_user():
    """Get the current user from request headers (raw Clerk user for compatibility)."""
    try:
        # Ensure provider is initialized
        _, service = _ensure_provider_initialized()
        
        # Log authentication attempt for debugging
        auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
        if not auth_header:
            logger.debug("No Authorization header found in request")
            return None
        
        logger.debug(f"Authorization header present: {auth_header[:20]}...")
        user = service.get_current_user_from_headers(dict(request.headers))
        if user:
            logger.debug(f"✅ User authenticated: {user.id}")
        else:
            logger.warning("❌ Authentication failed - user is None")
        return user
    except Exception as e:  # pragma: no cover - hard to simulate in unit tests
        logger.error(f"Unexpected error during authentication: {e}", exc_info=True)
        return None


def require_auth(f):
    """Decorator to require authentication for a route"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        logger.debug(f"🔐 [AUTH] require_auth decorator called for {f.__name__}")
        provider, _ = _ensure_provider_initialized()
        logger.debug(f"🔐 [AUTH] Clerk client initialized: {bool(provider.client)}")
        user = get_current_user()
        if not user:
            logger.warning(f"🔐 [AUTH] ❌ Authentication failed for {f.__name__} - returning 401")
            return jsonify({"error": "Authentication required"}), 401
        logger.debug(f"🔐 [AUTH] ✅ Authentication successful for {f.__name__}, user: {user.id}")
        g.user = user
        return f(*args, **kwargs)
    return decorated_function


def is_progressive_reader_admin(user_id: str) -> bool:
    """Check ProgressiveReader admin membership via provider."""
    _, service = _ensure_provider_initialized()
    return service.is_admin(user_id)


def require_admin(f):
    """Decorator to require ProgressiveReader admin role."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
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


def get_clerk_client():
    """Get the raw Clerk client for debug routes."""
    _ensure_provider_initialized()
    return clerk
