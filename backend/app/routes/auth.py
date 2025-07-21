"""Authentication routes for Clerk integration"""
from flask import Blueprint, jsonify, g
from ..utils.clerk_auth import optional_auth, get_user_email
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/auth/status', methods=['GET'])
@optional_auth
def auth_status():
    """Check if user is authenticated"""
    if g.user:
        # User is authenticated
        return jsonify({
            'isAuthenticated': True,
            'user': {
                'uid': g.user.id,
                'email': get_user_email(),
                'firstName': g.user.first_name,
                'lastName': g.user.last_name,
                'username': g.user.username,
                'imageUrl': g.user.image_url
            }
        })
    else:
        # User is not authenticated
        return jsonify({
            'isAuthenticated': False,
            'user': None
        })


@auth_bp.route('/auth/session', methods=['GET'])
@optional_auth
def get_session():
    """Get current session information"""
    if not g.user:
        return jsonify({'error': 'Not authenticated'}), 401

    return jsonify({
        'userId': g.user.id,
        'email': get_user_email(),
        'firstName': g.user.first_name,
        'lastName': g.user.last_name,
        'username': g.user.username,
        'createdAt': (
            g.user.created_at.isoformat()
            if hasattr(g.user.created_at, 'isoformat')
            else str(g.user.created_at)
        )
    })


# Note: Login/logout are handled by Clerk on the frontend
# These endpoints are kept for compatibility but return appropriate messages

@auth_bp.route('/auth/google/login', methods=['POST'])
def google_login():
    """Google login is handled by Clerk on the frontend"""
    return jsonify({
        'message': 'Authentication is handled by Clerk. Please use the frontend authentication flow.'
    }), 400


@auth_bp.route('/auth/logout', methods=['POST'])
def logout():
    """Logout is handled by Clerk on the frontend"""
    return jsonify({
        'message': 'Logout is handled by Clerk. Please use the frontend logout button.'
    }), 200
