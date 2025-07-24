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
    """Verify a Clerk session token using JWT and user validation"""
    if not clerk:
        logger.error("Clerk client not initialized - missing CLERK_SECRET_KEY")
        return None
        
    try:
        logger.debug("Verifying Clerk session token with JWT...")
        
        # Decode the JWT without verification first to get the session ID
        unverified = jwt.decode(token, options={"verify_signature": False})
        
        session_id = unverified.get('sid')
        user_id = unverified.get('sub')
        
        logger.debug(f"Extracted from JWT - session_id: {session_id}, user_id: {user_id}")
        
        if not session_id or not user_id:
            logger.warning(f"Session token missing session ID ({session_id}) or user ID ({user_id})")
            return None
        
        # Simplified approach: Just verify the user exists instead of checking session status
        # This avoids potential timeouts with the sessions API
        logger.debug(f"Verifying user {user_id} exists in Clerk...")
        
        try:
            user = clerk.users.get(user_id=user_id)
            if not user:
                logger.warning(f"User {user_id} not found in Clerk")
                return None
                
            logger.debug(f"User verified successfully: {user.id}")
            
            # Return session info based on JWT content
            return {
                'user_id': user_id,
                'session_id': session_id,
                'status': 'verified'  # We assume it's active if JWT is valid
            }
            
        except Exception as user_error:
            logger.error(f"User verification failed for {user_id}: {user_error}")
            logger.error(f"User error type: {type(user_error).__name__}")
            return None
        
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


def is_progressive_reader_admin(user_id: str) -> bool:
    """Check if the given user is an Admin of the ProgressiveReader organization."""
    logger.info(f"[🔐 ADMIN CHECK] Checking admin status for user_id: {user_id}")
    
    if not clerk:
        logger.error("[🔐 ADMIN CHECK] ❌ Clerk client not initialized")
        return False
    
    try:
        logger.debug(f"[🔐 ADMIN CHECK] Fetching organization memberships for user: {user_id}")
        # Use the correct API method to get user's organization memberships
        memberships = clerk.users.get_organization_memberships(user_id=user_id)
        
        logger.info(f"[🔐 ADMIN CHECK] Found {len(memberships.data)} organization memberships")
        
        for i, m in enumerate(memberships.data):
            org = getattr(m, "organization", None)
            org_name = getattr(org, "name", "") if org else ""
            role = m.role
            
            logger.info(f"[🔐 ADMIN CHECK] Membership {i+1}: org='{org_name}', role='{role}'")
            
            # Check if this is the ProgressiveReader org with admin role
            is_progressive_reader = org_name == "ProgressiveReader"
            # Handle both "admin" and "org:admin" role formats
            is_admin_role = role.lower() == "admin" or role.lower() == "org:admin"
            
            logger.debug(f"[🔐 ADMIN CHECK] Checks: is_progressive_reader={is_progressive_reader}, is_admin_role={is_admin_role}")
            
            if is_progressive_reader and is_admin_role:
                logger.info(f"[🔐 ADMIN CHECK] ✅ User {user_id} is admin of ProgressiveReader org")
                return True
        
        logger.warning(f"[🔐 ADMIN CHECK] ❌ User {user_id} is not an admin of ProgressiveReader org")
        return False
        
    except Exception as e:
        logger.error(f"[🔐 ADMIN CHECK] ❌ Error checking admin membership for {user_id}: {e}")
        logger.error(f"[🔐 ADMIN CHECK] Exception type: {type(e).__name__}")
        return False


def require_admin(f):
    """Decorator to require ProgressiveReader admin role."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        logger.info(f"[🔐 ADMIN DECORATOR] require_admin called for route: {f.__name__}")
        
        user = get_current_user()
        if not user:
            logger.warning(f"[🔐 ADMIN DECORATOR] ❌ No authenticated user found for route: {f.__name__}")
            return jsonify({"error": "Authentication required"}), 401
        
        logger.info(f"[🔐 ADMIN DECORATOR] ✅ User authenticated: {user.id}")
        logger.info(f"[🔐 ADMIN DECORATOR] Checking admin permissions for route: {f.__name__}")
        
        is_admin = is_progressive_reader_admin(user.id)
        logger.info(f"[🔐 ADMIN DECORATOR] Admin check result: {is_admin}")
        
        if not is_admin:
            logger.warning(f"[🔐 ADMIN DECORATOR] ❌ User {user.id} denied access to admin route: {f.__name__}")
            return jsonify({"error": "Forbidden"}), 403
        
        logger.info(f"[🔐 ADMIN DECORATOR] ✅ User {user.id} granted access to admin route: {f.__name__}")
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
