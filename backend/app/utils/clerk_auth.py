"""
Clerk authentication middleware for Flask
"""
import os
import jwt
from functools import wraps
from flask import request, jsonify, g
from clerk_backend_api import Clerk
import logging

logger = logging.getLogger(__name__)

# Initialize Clerk client
clerk_secret_key = os.getenv('CLERK_SECRET_KEY')
if not clerk_secret_key:
    logger.warning("CLERK_SECRET_KEY not found in environment variables")
    clerk = None
else:
    clerk = Clerk(bearer_auth=clerk_secret_key)


def verify_session_token(token):
    """Verify a Clerk session token using Clerk's backend API"""
    if not clerk:
        logger.error("Clerk client not initialized - missing CLERK_SECRET_KEY")
        return None
        
    try:
        logger.debug("Verifying Clerk session token...")
        
        # Use Clerk's backend API to verify the session token
        # This is the proper way to verify Clerk tokens
        session = clerk.sessions.verify_token(token)
        
        if not session:
            logger.warning("Clerk session verification returned None")
            return None
            
        logger.debug(f"Session verified successfully: {session.id}")
        
        return {
            'user_id': session.user_id,
            'session_id': session.id,
            'status': session.status
        }
        
    except Exception as e:
        logger.error(f"Error verifying Clerk session token: {e}")
        logger.error(f"Exception type: {type(e).__name__}")
        return None


def get_current_user():
    """Get the current user from Clerk session"""
    if not clerk:
        logger.error("Clerk client not available")
        return None
        
    # Get the session token from the Authorization header
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        logger.warning("No Authorization header found")
        return None
    
    # Extract the token (expecting "Bearer <token>")
    parts = auth_header.split(' ')
    if len(parts) != 2 or parts[0] != 'Bearer':
        logger.warning("Invalid Authorization header format")
        return None
    
    session_token = parts[1]
    logger.debug(f"Extracted session token (length: {len(session_token)})")
    
    try:
        # Verify the token and get claims
        session_info = verify_session_token(session_token)
        if not session_info:
            logger.warning("Session token verification failed")
            return None
            
        user_id = session_info['user_id']
        logger.debug(f"Getting user details for user_id: {user_id}")
        
        # Get user details from Clerk
        user = clerk.users.get(user_id=user_id)
        logger.debug(f"User retrieved successfully: {user.id}")
        
        return user
            
    except Exception as e:
        logger.error(f"Unexpected error during authentication: {e}")
        logger.error(f"Exception type: {type(e).__name__}")
        return None
    
    return None


def require_auth(f):
    """Decorator to require authentication for a route"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        logger.debug(f"[🔐 AUTH] require_auth called for route: {f.__name__}")
        
        user = get_current_user()
        if not user:
            logger.warning(f"[🔐 AUTH] Authentication failed for route: {f.__name__}")
            return jsonify({"error": "Authentication required"}), 401
        
        logger.debug(f"[🔐 AUTH] Authentication successful for user: {user.id}")
        
        # Store the user in Flask's g object for access in the route
        g.user = user
        return f(*args, **kwargs)
    
    return decorated_function


def optional_auth(f):
    """Decorator to optionally authenticate (user might be None)"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        g.user = user  # Could be None
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
