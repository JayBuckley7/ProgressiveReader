from flask import Blueprint, request, jsonify, Response
from ..utils.clerk_auth import require_auth
from ..utils.clerk_auth import get_user_id
from clerk_backend_api import Clerk
import os
import logging
import requests
import json

logger = logging.getLogger(__name__)

drive_bp = Blueprint('drive', __name__, url_prefix='/drive')

# Initialize Clerk client using secret key from env
clerk_secret_key = os.getenv('CLERK_SECRET_KEY')
clerk_client = Clerk(bearer_auth=clerk_secret_key) if clerk_secret_key else None

GDRIVE_BASE = 'https://www.googleapis.com/drive/v3'
UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'


def _get_google_token_object(user_id: str):
    """Return the OAuth token object for the user or None."""
    if not clerk_client:
        logger.error('Clerk client not configured')
        return None
    try:
        tokens = clerk_client.users.get_o_auth_access_token(
            user_id=user_id, provider='oauth_google'
        )
        if tokens and len(tokens) > 0:
            return tokens[0]
    except Exception as e:
        logger.error('Failed to retrieve Google token from Clerk: %s', e)
    return None


def get_google_access_token(user_id: str) -> str | None:
    token_obj = _get_google_token_object(user_id)
    if token_obj:
        return token_obj.token
    return None


@drive_bp.route('/files', methods=['GET'])
@require_auth
def list_files():
    user_id = get_user_id()
    token = get_google_access_token(user_id)
    if not token:
        return jsonify({'error': 'No Google token'}), 400
    folder_id = request.args.get('folderId')
    params = {
        'fields': 'files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink)'
    }
    if folder_id:
        params['q'] = f"'{folder_id}' in parents and trashed=false"
    r = requests.get(f'{GDRIVE_BASE}/files', headers={'Authorization': f'Bearer {token}'}, params=params)
    if not r.ok:
        return jsonify({'error': r.text}), r.status_code
    return jsonify(r.json().get('files', []))


@drive_bp.route('/upload', methods=['POST'])
@require_auth
def upload_file():
    user_id = get_user_id()
    token = get_google_access_token(user_id)
    if not token:
        return jsonify({'error': 'No Google token'}), 400

    if 'file' not in request.files:
        return jsonify({'error': 'Missing file'}), 400
    file = request.files['file']
    folder_id = request.form.get('folderId')
    metadata = {'name': file.filename}
    if folder_id:
        metadata['parents'] = [folder_id]
    files = {
        'metadata': ('metadata', json.dumps(metadata), 'application/json; charset=UTF-8'),
        'file': (file.filename, file.stream, file.mimetype)
    }
    r = requests.post(UPLOAD_URL, headers={'Authorization': f'Bearer {token}'}, files=files)
    if not r.ok:
        return jsonify({'error': r.text}), r.status_code
    return jsonify(r.json())


@drive_bp.route('/download/<file_id>', methods=['GET'])
@require_auth
def download_file(file_id):
    user_id = get_user_id()
    token = get_google_access_token(user_id)
    if not token:
        return jsonify({'error': 'No Google token'}), 400
    r = requests.get(
        f'{GDRIVE_BASE}/files/{file_id}',
        headers={'Authorization': f'Bearer {token}'},
        params={'alt': 'media'},
        stream=True,
    )
    if not r.ok:
        return jsonify({'error': r.text}), r.status_code
    return Response(r.content, headers={'Content-Type': r.headers.get('Content-Type', 'application/octet-stream')})


@drive_bp.route('/files/<file_id>', methods=['DELETE'])
@require_auth
def delete_file(file_id):
    user_id = get_user_id()
    token = get_google_access_token(user_id)
    if not token:
        return jsonify({'error': 'No Google token'}), 400
    r = requests.delete(f'{GDRIVE_BASE}/files/{file_id}', headers={'Authorization': f'Bearer {token}'})
    if r.status_code == 204:
        return jsonify({'success': True})
    return jsonify({'error': r.text}), r.status_code


@drive_bp.route('/token', methods=['POST'])
@require_auth
def google_token():
    """Return the current user's Google OAuth access token."""
    user_id = get_user_id()
    token_obj = _get_google_token_object(user_id)
    if not token_obj or not token_obj.token:
        return jsonify({'error': 'No Google token'}), 400

    expires_in = 0
    expires_at = getattr(token_obj, 'expires_at', None)
    if expires_at is not None:
        import time

        try:
            exp_ts = int(float(expires_at))
        except (TypeError, ValueError):
            logger.warning("Unexpected expires_at value: %r", expires_at)
            exp_ts = int(time.time())
        expires_in = max(0, exp_ts - int(time.time()))

    return jsonify({'access_token': token_obj.token, 'expires_in': expires_in})
