"""Drive domain routes."""
import logging

from flask import Blueprint, request, jsonify, current_app

from ...utils.clerk_auth import require_auth, get_user_id
from .controller import DriveController
from .errors import DriveProviderNotConfiguredError, GoogleNotConnectedError

logger = logging.getLogger(__name__)

drive_bp = Blueprint('drive', __name__, url_prefix='/drive')

@drive_bp.route('/token', methods=['POST'])
@require_auth
def google_token():
    """Return the current user's Google OAuth access token."""
    try:
        container = current_app.extensions["container"]
        controller = DriveController(drive_service=container.drive_service, clerk_secret_key=container.clerk_secret_key)

        user_id = get_user_id()
        if not user_id:
            logger.error('[drive-token] No user ID')
            return jsonify({'error': 'Authentication required'}), 401

        try:
            response = controller.get_token(user_id=user_id)
            return jsonify(response.model_dump())
        except ValidationError as e:
            logger.error(f"Invalid token response: {e}")
            return jsonify({'error': 'Invalid token response'}), 500

    except DriveProviderNotConfiguredError as e:
        logger.error('[drive-token] Clerk client not initialized')
        return jsonify({'error': str(e), 'code': 'CLERK_NOT_CONFIGURED'}), 500
    except GoogleNotConnectedError:
        return jsonify(
            {
                'error': 'Google account not connected',
                'code': 'GOOGLE_NOT_CONNECTED',
                'message': 'Please connect your Google account in Clerk to use Google Drive features',
            }
        ), 404
    except ValueError as e:
        # Preserve legacy behavior for other ValueErrors from integration layer.
        error_msg = str(e)
        logger.error('[drive-token] Error: %s', error_msg)
        return jsonify({'error': error_msg}), 400
        
    except Exception as e:
        logger.error('[drive-token] Unexpected error in google_token endpoint: %s', e, exc_info=True)
        logger.error('[drive-token] Exception type: %s', type(e).__name__)
        return jsonify({
            'error': 'Internal server error',
            'code': 'INTERNAL_ERROR',
            'message': str(e)
        }), 500
