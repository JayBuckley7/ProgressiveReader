"""Drive domain routes."""
from flask import Blueprint, request, jsonify, Response, current_app
from pydantic import ValidationError
import os
import logging

from ...utils.clerk_auth import require_auth, get_user_id
from .integrations import ClerkDriveProvider, GoogleDriveIntegration
from .service import DriveService
from .schemas import ListFilesRequest, TokenResponse, HealthResponse

logger = logging.getLogger(__name__)

drive_bp = Blueprint('drive', __name__, url_prefix='/drive')

# Initialize provider and service
clerk_secret_key = os.getenv('CLERK_SECRET_KEY')
drive_provider = ClerkDriveProvider(secret_key=clerk_secret_key)
drive_integration = GoogleDriveIntegration(drive_provider)
drive_service = DriveService(drive_integration)


@drive_bp.route('/health', methods=['GET'])
def drive_health():
    """Health check endpoint to verify Clerk configuration."""
    logger.info('🏥 [DRIVE HEALTH] Health check called')

    health_status = {
        'clerk_secret_key_configured': bool(clerk_secret_key),
        'clerk_client_initialized': bool(drive_provider.client),
        'service': 'drive'
    }

    if clerk_secret_key:
        health_status['clerk_secret_key_length'] = len(clerk_secret_key)
        health_status['clerk_secret_key_prefix'] = clerk_secret_key[:8] + '...' if len(clerk_secret_key) > 8 else clerk_secret_key

    logger.info(f'🏥 [DRIVE HEALTH] Status: {health_status}')

    try:
        health = HealthResponse(**health_status)
        status_code = 200 if health.clerk_client_initialized else 500
        return jsonify(health.dict()), status_code
    except ValidationError as e:
        logger.error(f"Invalid health response: {e}")
        return jsonify(health_status), 500


@drive_bp.route('/files', methods=['GET'])
@require_auth
def list_files():
    """List files in Google Drive."""
    try:
        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        folder_id = request.args.get('folderId')
        try:
            req = ListFilesRequest(folderId=folder_id)
        except ValidationError as e:
            return jsonify({'error': f'Invalid request: {str(e)}'}), 400

        files = drive_service.list_files(user_id, req.folderId)
        return jsonify([file.dict() for file in files])

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
        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        if 'file' not in request.files:
            return jsonify({'error': 'Missing file'}), 400

        file = request.files['file']
        folder_id = request.form.get('folderId')

        try:
            req = ListFilesRequest(folderId=folder_id)
        except ValidationError as e:
            return jsonify({'error': f'Invalid request: {str(e)}'}), 400

        file_content = file.read()
        result = drive_service.upload_file(
            user_id=user_id,
            file_content=file_content,
            filename=file.filename,
            mimetype=file.mimetype,
            folder_id=req.folderId
        )
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
        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        content, content_type = drive_service.download_file(user_id, file_id)
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
        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        size_raw = request.args.get('size')
        try:
            size = int(size_raw) if size_raw else 420
            size = max(64, min(size, 1024))
        except Exception:
            size = 420

        content, content_type = drive_service.get_thumbnail(user_id, file_id, size=size)
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
        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        success = drive_service.delete_file(user_id, file_id)
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
    logger.info('🔗 [DRIVE TOKEN] ==========================================')
    logger.info('🔗 [DRIVE TOKEN] /drive/token endpoint called')

    try:
        logger.info('🔗 [DRIVE TOKEN] Getting user ID...')
        user_id = get_user_id()
        if not user_id:
            logger.error('🔗 [DRIVE TOKEN] ❌ No user ID')
            return jsonify({'error': 'Authentication required'}), 401

        logger.info('🔗 [DRIVE TOKEN] ✅ User ID: %s', user_id)

        # Check if Clerk client is initialized
        if not drive_provider.client:
            logger.error('🔗 [DRIVE TOKEN] ❌ Clerk client not initialized')
            return jsonify({
                'error': 'Clerk client not configured',
                'code': 'CLERK_NOT_CONFIGURED'
            }), 500

        logger.info('🔗 [DRIVE TOKEN] Getting Google token object...')
        token_info = drive_service.get_access_token_info(user_id)

        logger.info('🔗 [DRIVE TOKEN] ✅ Returning token response')
        logger.info('🔗 [DRIVE TOKEN] Token preview: %s...', str(token_info['access_token'])[:20])
        logger.info('🔗 [DRIVE TOKEN] Expires in: %s seconds', token_info['expires_in'])
        logger.info('🔗 [DRIVE TOKEN] ==========================================')

        try:
            response = TokenResponse(**token_info)
            return jsonify(response.dict())
        except ValidationError as e:
            logger.error(f"Invalid token response: {e}")
            return jsonify(token_info)

    except ValueError as e:
        error_msg = str(e)
        logger.error('🔗 [DRIVE TOKEN] ❌ Error: %s', error_msg)
        logger.info('🔗 [DRIVE TOKEN] ==========================================')
        
        # Check if it's a "no token" error - this means user needs to connect Google account
        if 'No Google token' in error_msg or 'token' in error_msg.lower():
            return jsonify({
                'error': 'Google account not connected',
                'code': 'GOOGLE_NOT_CONNECTED',
                'message': 'Please connect your Google account in Clerk to use Google Drive features'
            }), 404
        return jsonify({'error': error_msg}), 400
        
    except Exception as e:
        logger.error('🔗 [DRIVE TOKEN] ❌ Unexpected error in google_token endpoint: %s', e, exc_info=True)
        logger.error('🔗 [DRIVE TOKEN] Exception type: %s', type(e).__name__)
        logger.info('🔗 [DRIVE TOKEN] ==========================================')
        return jsonify({
            'error': 'Internal server error',
            'code': 'INTERNAL_ERROR',
            'message': str(e)
        }), 500
