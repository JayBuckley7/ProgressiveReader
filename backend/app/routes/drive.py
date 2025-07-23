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

@drive_bp.route('/health', methods=['GET'])
def drive_health():
    """Health check endpoint to verify Clerk configuration"""
    logger.info('🏥 [DRIVE HEALTH] Health check called')
    
    health_status = {
        'clerk_secret_key_configured': bool(clerk_secret_key),
        'clerk_client_initialized': bool(clerk_client),
        'service': 'drive'
    }
    
    if clerk_secret_key:
        health_status['clerk_secret_key_length'] = len(clerk_secret_key)
        health_status['clerk_secret_key_prefix'] = clerk_secret_key[:8] + '...' if len(clerk_secret_key) > 8 else clerk_secret_key
    
    logger.info(f'🏥 [DRIVE HEALTH] Status: {health_status}')
    
    status_code = 200 if health_status['clerk_client_initialized'] else 500
    return jsonify(health_status), status_code

GDRIVE_BASE = 'https://www.googleapis.com/drive/v3'
UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'


def _get_google_token_object(user_id: str):
    """Return the OAuth token object for the user or None."""
    logger.info('🔗 [CLERK TOKEN] _get_google_token_object called for user: %s', user_id)
    
    if not clerk_client:
        logger.error('🔗 [CLERK TOKEN] ❌ Clerk client not configured')
        return None
    
    logger.info('🔗 [CLERK TOKEN] ✅ Clerk client available, making API call...')
    
    try:
        import threading
        import time
        
        logger.info('🔗 [CLERK TOKEN] 🚀 Calling clerk_client.users.get_o_auth_access_token...')
        logger.info('🔗 [CLERK TOKEN] Parameters: user_id=%s, provider=oauth_google', user_id)
        
        # Windows-compatible timeout using threading
        result = [None]
        exception = [None]
        
        def clerk_api_call():
            try:
                result[0] = clerk_client.users.get_o_auth_access_token(
                    user_id=user_id, provider='oauth_google'
                )
            except Exception as e:
                exception[0] = e
        
        thread = threading.Thread(target=clerk_api_call)
        thread.daemon = True
        start_time = time.time()
        thread.start()
        
        # Wait for up to 15 seconds
        thread.join(timeout=15.0)
        elapsed_time = time.time() - start_time
        
        if thread.is_alive():
            logger.error('🔗 [CLERK TOKEN] ❌ Timeout: Clerk API call took longer than 15 seconds')
            return None
        
        if exception[0]:
            raise exception[0]
            
        tokens = result[0]
        
        logger.info('🔗 [CLERK TOKEN] ✅ Received response from Clerk API in %.2f seconds', elapsed_time)
        logger.info('🔗 [CLERK TOKEN] Tokens received: %s', len(tokens) if tokens else 0)
        
        if tokens and len(tokens) > 0:
            token_obj = tokens[0]
            logger.info('🔗 [CLERK TOKEN] ✅ Returning first token object')
            logger.info('🔗 [CLERK TOKEN] Token preview: %s...', str(token_obj.token)[:20] if hasattr(token_obj, 'token') else 'No token attr')
            return token_obj
        else:
            logger.warning('🔗 [CLERK TOKEN] ⚠️ No tokens returned from Clerk')
            return None
            
    except Exception as e:
        logger.error('🔗 [CLERK TOKEN] ❌ Failed to retrieve Google token from Clerk: %s', e)
        logger.error('🔗 [CLERK TOKEN] Exception type: %s', type(e).__name__)
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
    logger.info('🔗 [DRIVE TOKEN] ==========================================')
    logger.info('🔗 [DRIVE TOKEN] /drive/token endpoint called')
    
    try:
        logger.info('🔗 [DRIVE TOKEN] Getting user ID...')
        user_id = get_user_id()
        logger.info('🔗 [DRIVE TOKEN] ✅ User ID: %s', user_id)
        
        logger.info('🔗 [DRIVE TOKEN] Getting Google token object...')
        token_obj = _get_google_token_object(user_id)
        
        if not token_obj:
            logger.error('🔗 [DRIVE TOKEN] ❌ No token object returned')
            logger.info('🔗 [DRIVE TOKEN] ==========================================')
            return jsonify({'error': 'No Google token object'}), 400
            
        if not token_obj.token:
            logger.error('🔗 [DRIVE TOKEN] ❌ Token object has no token')
            logger.info('🔗 [DRIVE TOKEN] ==========================================')
            return jsonify({'error': 'No Google token'}), 400

        logger.info('🔗 [DRIVE TOKEN] ✅ Token object obtained, processing expiry...')
        
        expires_in = 0
        expires_at = getattr(token_obj, 'expires_at', None)
        if expires_at is not None:
            import time

            try:
                exp_ts = int(float(expires_at))
            except (TypeError, ValueError):
                logger.warning("🔗 [DRIVE TOKEN] ⚠️ Unexpected expires_at value: %r", expires_at)
                exp_ts = int(time.time())
            expires_in = max(0, exp_ts - int(time.time()))

        logger.info('🔗 [DRIVE TOKEN] ✅ Returning token response')
        logger.info('🔗 [DRIVE TOKEN] Token preview: %s...', str(token_obj.token)[:20])
        logger.info('🔗 [DRIVE TOKEN] Expires in: %s seconds', expires_in)
        logger.info('🔗 [DRIVE TOKEN] ==========================================')
        
        return jsonify({'access_token': token_obj.token, 'expires_in': expires_in})
        
    except Exception as e:
        logger.error('🔗 [DRIVE TOKEN] ❌ Unexpected error in google_token endpoint: %s', e)
        logger.error('🔗 [DRIVE TOKEN] Exception type: %s', type(e).__name__)
        logger.info('🔗 [DRIVE TOKEN] ==========================================')
        return jsonify({'error': 'Internal server error'}), 500
