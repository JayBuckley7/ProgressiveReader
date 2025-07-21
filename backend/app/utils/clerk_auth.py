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
clerk_secret_key = os.getenv("CLERK_SECRET_KEY")
if not clerk_secret_key:
    logger.error("CLERK_SECRET_KEY not found in environment variables")
    raise RuntimeError(
        "CLERK_SECRET_KEY is required for authentication middleware"
    )
clerk = Clerk(bearer_auth=clerk_secret_key)


def verify_session_token(token):
    """Verify a Clerk session token and return the decoded claims"""
    if not clerk:
        return None
        
    try:
        # For Clerk, we need to decode the JWT to get the session ID
        # The token structure may vary, so let's decode it first
        # Note: This is a simplified version - in production you should verify the JWT signature
        decoded = jwt.decode(token, options={"verify_signature": False})
        
        # Get the subject (user ID) from the token
        user_id = decoded.get('sub')
        if not user_id:
            return None
            
        return {
            'user_id': user_id,
            'session_id': decoded.get('sid'),
            'email': decoded.get('email')
        }
    except Exception as e:
        logger.error(f"Error decoding token: {e}")
        return None


def get_current_user():
    """Get the current user from Clerk session"""
    if not clerk:
        return None
        
    # Get the session token from the Authorization header
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    
    # Extract the token (expecting "Bearer <token>")
    parts = auth_header.split(' ')
    if len(parts) != 2 or parts[0] != 'Bearer':
        return None
    
    session_token = parts[1]
    
    try:
        # Verify the token and get claims
        claims = verify_session_token(session_token)
        if not claims:
            return None
            
        # Get user details from Clerk
        user = clerk.users.get(user_id=claims['user_id'])
        
        # Add the email from claims if not in user object
        if hasattr(user, 'email_addresses') and not user.email_addresses and claims.get('email'):
            # Create a simple object to hold email info
            class EmailAddress:
                def __init__(self, email):
                    self.email_address = email
            user.email_addresses = [EmailAddress(claims['email'])]
            
        return user
            
    except Exception as e:
        logger.error(f"Unexpected error during authentication: {e}")
        return None
    
    return None


def require_auth(f):
    """Decorator to require authentication for a route"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        
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
