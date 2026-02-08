"""Drive domain routes."""
from flask import Blueprint, request, jsonify, Response, current_app
from pydantic import ValidationError
import logging

from ...utils.clerk_auth import require_auth, get_user_id
from .controller import DriveController, clamp_thumbnail_size
from .errors import DriveProviderNotConfiguredError, GoogleNotConnectedError
from .schemas import ListFilesRequest, TokenResponse, HealthResponse

logger = logging.getLogger(__name__)

drive_bp = Blueprint('drive', __name__, url_prefix='/drive')


@drive_bp.route('/health', methods=['GET'])
def drive_health():
    """Health check endpoint to verify Clerk configuration."""
    container = current_app.extensions["container"]
    try:
        controller = DriveController(drive_service=container.drive_service, clerk_secret_key=container.clerk_secret_key)
        health = controller.health()
        status_code = 200 if health.clerk_client_initialized else 500
        return jsonify(health.model_dump()), status_code
    except ValidationError as e:
        logger.error(f"Invalid health response: {e}")
        return jsonify({'service': 'drive'}), 500


@drive_bp.route('/files', methods=['GET'])
@require_auth
def list_files():
    """List files in Google Drive."""
    try:
        container = current_app.extensions["container"]
        controller = DriveController(drive_service=container.drive_service, clerk_secret_key=container.clerk_secret_key)

        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        folder_id = request.args.get('folderId')
        try:
            req = ListFilesRequest(folderId=folder_id)
        except ValidationError as e:
            return jsonify({'error': f'Invalid request: {str(e)}'}), 400

        return jsonify(controller.list_files(user_id=user_id, folder_id=req.folderId))

    except ValueError as e:
        logger.error(f"Drive error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error listing files: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


@drive_bp.route('/upload', methods=['POST'])
@require_auth
def upload_file():
    """Upload a file to Google Drive."""
    try:
        container = current_app.extensions["container"]
        controller = DriveController(drive_service=container.drive_service, clerk_secret_key=container.clerk_secret_key)

        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        file = request.files.get('file')
        folder_id = request.form.get('folderId')

        try:
            req = ListFilesRequest(folderId=folder_id)
        except ValidationError as e:
            return jsonify({'error': f'Invalid request: {str(e)}'}), 400

        result = controller.upload_file(user_id=user_id, upload=file, folder_id=req.folderId)
        return jsonify(result)

    except ValueError as e:
        logger.error(f"Drive error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error uploading file: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


@drive_bp.route('/download/<file_id>', methods=['GET'])
@require_auth
def download_file(file_id):
    """Download a file from Google Drive."""
    try:
        container = current_app.extensions["container"]
        controller = DriveController(drive_service=container.drive_service, clerk_secret_key=container.clerk_secret_key)

        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        content, content_type = controller.download_file(user_id=user_id, file_id=file_id)
        return Response(content, headers={'Content-Type': content_type})

    except ValueError as e:
        logger.error(f"Drive error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error downloading file: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


@drive_bp.route('/thumbnail/<file_id>', methods=['GET'])
@require_auth
def thumbnail_file(file_id):
    """Return a thumbnail image for a Drive file, if available."""
    try:
        container = current_app.extensions["container"]
        controller = DriveController(drive_service=container.drive_service, clerk_secret_key=container.clerk_secret_key)

        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        size = clamp_thumbnail_size(request.args.get('size'))

        content, content_type = controller.get_thumbnail(user_id=user_id, file_id=file_id, size=size)
        if not content:
            return jsonify({'error': 'Thumbnail not available'}), 404

        return Response(
            content,
            headers={
                'Content-Type': content_type or 'image/jpeg',
                # Allow clients to cache thumbnails; Drive thumbnails may change, but this is good enough for MVP.
                'Cache-Control': 'private, max-age=86400',
            },
        )

    except ValueError as e:
        logger.error(f"Drive error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error fetching thumbnail: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


@drive_bp.route('/files/<file_id>', methods=['DELETE'])
@require_auth
def delete_file(file_id):
    """Delete a file from Google Drive."""
    try:
        container = current_app.extensions["container"]
        controller = DriveController(drive_service=container.drive_service, clerk_secret_key=container.clerk_secret_key)

        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        success = controller.delete_file(user_id=user_id, file_id=file_id)
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Failed to delete file'}), 500

    except ValueError as e:
        logger.error(f"Drive error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error deleting file: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500


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
