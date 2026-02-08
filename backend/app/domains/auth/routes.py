"""Authentication routes for Clerk integration"""
from flask import Blueprint, jsonify, g, request, current_app
from pydantic import ValidationError
from ...utils.clerk_auth import (
    optional_auth,
    require_auth,
    get_user_id,
    get_user_email,
)
from .schemas import SettingsResponse, SaveSettingsRequest, SaveSettingsResponse
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


@auth_bp.route('/settings', methods=['GET'])
@require_auth
def get_settings():
    """Return the caller's settings (empty object if none stored)."""
    try:
        user_id = get_user_id()
        if not user_id:
            return jsonify({"error": "Authentication required"}), 401

        service = current_app.extensions["container"].auth_service
        settings = service.get_settings(user_id)
        response = SettingsResponse(settings=settings)
        return jsonify(response.model_dump())
    except ValueError as e:
        logger.error(f"Error getting settings: {e}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Unexpected error getting settings: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@auth_bp.route('/settings', methods=['POST'])
@require_auth
def save_settings():
    """Merge the JSON payload into the user's settings without clobbering other metadata."""
    try:
        user_id = get_user_id()
        if not user_id:
            return jsonify({"error": "Authentication required"}), 401

        data = request.get_json() or {}
        try:
            req = SaveSettingsRequest(settings=data)
        except ValidationError as e:
            return jsonify({"error": f"Invalid request: {str(e)}"}), 400

        service = current_app.extensions["container"].auth_service
        success = service.save_settings(user_id, req.settings)
        response = SaveSettingsResponse(success=success)
        return jsonify(response.model_dump())
    except ValueError as e:
        logger.error(f"Error saving settings: {e}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Unexpected error saving settings: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
