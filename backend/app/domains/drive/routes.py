"""Drive domain routes."""
import logging

from flask import Blueprint, request, jsonify, current_app, Response
from pydantic import ValidationError

from ...utils.clerk_auth import require_auth, get_user_id
from .controller import DriveController
from .errors import DriveProviderNotConfiguredError, GoogleNotConnectedError

logger = logging.getLogger(__name__)

drive_bp = Blueprint('drive', __name__, url_prefix='/drive')


def _controller() -> DriveController:
    container = current_app.extensions["container"]
    return DriveController(drive_service=container.drive_service, clerk_secret_key=container.clerk_secret_key)


@drive_bp.route("/health", methods=["GET"])
def drive_health():
    """Drive domain health info (no auth)."""
    try:
        return jsonify(_controller().health().model_dump())
    except Exception as e:
        logger.error("[drive-health] Unexpected error: %s", e, exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@drive_bp.route('/token', methods=['POST'])
@require_auth
def google_token():
    """Return the current user's Google OAuth access token."""
    try:
        controller = _controller()

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


@drive_bp.route("/files", methods=["GET"])
@require_auth
def list_files():
    """List Drive files for the current user (JSON)."""
    try:
        controller = _controller()
        user_id = get_user_id()
        if not user_id:
            logger.error("[drive-files] No user ID")
            return jsonify({"error": "Authentication required"}), 401

        folder_id = request.args.get("folderId") or None
        files = controller.list_files(user_id=user_id, folder_id=folder_id)
        return jsonify(files)

    except DriveProviderNotConfiguredError as e:
        return jsonify({"error": str(e), "code": "CLERK_NOT_CONFIGURED"}), 500
    except GoogleNotConnectedError:
        return jsonify(
            {
                "error": "Google account not connected",
                "code": "GOOGLE_NOT_CONNECTED",
                "message": "Please connect your Google account in Clerk to use Google Drive features",
            }
        ), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error("[drive-files] Unexpected error: %s", e, exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@drive_bp.route("/upload", methods=["POST"])
@require_auth
def upload_file():
    """Upload a file to Drive for the current user (multipart form)."""
    try:
        controller = _controller()
        user_id = get_user_id()
        if not user_id:
            logger.error("[drive-upload] No user ID")
            return jsonify({"error": "Authentication required"}), 401

        # KMP sends multipart with `file` and optional `folderId`.
        upload = request.files.get("file")
        folder_id = request.form.get("folderId") or None

        res = controller.upload_file(user_id=user_id, upload=upload, folder_id=folder_id)
        return jsonify(res)

    except DriveProviderNotConfiguredError as e:
        return jsonify({"error": str(e), "code": "CLERK_NOT_CONFIGURED"}), 500
    except GoogleNotConnectedError:
        return jsonify(
            {
                "error": "Google account not connected",
                "code": "GOOGLE_NOT_CONNECTED",
                "message": "Please connect your Google account in Clerk to use Google Drive features",
            }
        ), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error("[drive-upload] Unexpected error: %s", e, exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@drive_bp.route("/download/<file_id>", methods=["GET"])
@require_auth
def download_file(file_id: str):
    """Download raw file bytes from Drive."""
    try:
        controller = _controller()
        user_id = get_user_id()
        if not user_id:
            logger.error("[drive-download] No user ID")
            return jsonify({"error": "Authentication required"}), 401

        data, content_type = controller.download_file(user_id=user_id, file_id=file_id)
        # Do not force attachment; clients can decide. Keep content-type accurate.
        return Response(data, status=200, mimetype=content_type or "application/octet-stream")

    except DriveProviderNotConfiguredError as e:
        return jsonify({"error": str(e), "code": "CLERK_NOT_CONFIGURED"}), 500
    except GoogleNotConnectedError:
        return jsonify(
            {
                "error": "Google account not connected",
                "code": "GOOGLE_NOT_CONNECTED",
                "message": "Please connect your Google account in Clerk to use Google Drive features",
            }
        ), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error("[drive-download] Unexpected error: %s", e, exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@drive_bp.route("/thumbnail/<file_id>", methods=["GET"])
@require_auth
def thumbnail(file_id: str):
    """Best-effort thumbnail bytes (may 404 if none)."""
    try:
        from .controller import clamp_thumbnail_size

        controller = _controller()
        user_id = get_user_id()
        if not user_id:
            logger.error("[drive-thumbnail] No user ID")
            return jsonify({"error": "Authentication required"}), 401

        size = clamp_thumbnail_size(request.args.get("size"))
        data, content_type = controller.get_thumbnail(user_id=user_id, file_id=file_id, size=size)
        if not data:
            return jsonify({"error": "Thumbnail not available"}), 404
        return Response(data, status=200, mimetype=content_type or "image/jpeg")

    except DriveProviderNotConfiguredError as e:
        return jsonify({"error": str(e), "code": "CLERK_NOT_CONFIGURED"}), 500
    except GoogleNotConnectedError:
        return jsonify(
            {
                "error": "Google account not connected",
                "code": "GOOGLE_NOT_CONNECTED",
                "message": "Please connect your Google account in Clerk to use Google Drive features",
            }
        ), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error("[drive-thumbnail] Unexpected error: %s", e, exc_info=True)
        return jsonify({"error": "Internal server error"}), 500


@drive_bp.route("/files/<file_id>", methods=["DELETE"])
@require_auth
def delete_file(file_id: str):
    """Delete a Drive file."""
    try:
        controller = _controller()
        user_id = get_user_id()
        if not user_id:
            logger.error("[drive-delete] No user ID")
            return jsonify({"error": "Authentication required"}), 401

        ok = controller.delete_file(user_id=user_id, file_id=file_id)
        if ok:
            return ("", 204)
        return jsonify({"error": "Not found"}), 404

    except DriveProviderNotConfiguredError as e:
        return jsonify({"error": str(e), "code": "CLERK_NOT_CONFIGURED"}), 500
    except GoogleNotConnectedError:
        return jsonify(
            {
                "error": "Google account not connected",
                "code": "GOOGLE_NOT_CONNECTED",
                "message": "Please connect your Google account in Clerk to use Google Drive features",
            }
        ), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error("[drive-delete] Unexpected error: %s", e, exc_info=True)
        return jsonify({"error": "Internal server error"}), 500
