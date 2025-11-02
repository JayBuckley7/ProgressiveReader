"""Google Drive API integration."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional, Any, Dict, List
import os
import logging
import threading
import time
import requests
import json

try:
    from clerk_backend_api import Clerk  # type: ignore
except Exception:
    Clerk = None  # type: ignore

logger = logging.getLogger(__name__)

GDRIVE_BASE = 'https://www.googleapis.com/drive/v3'
UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'


class DriveProvider(ABC):
    """Abstraction over Google Drive providers."""

    @abstractmethod
    def get_access_token(self, user_id: str) -> Optional[str]:
        """Get Google OAuth access token for the user."""
        raise NotImplementedError

    @abstractmethod
    def get_token_object(self, user_id: str) -> Optional[Any]:
        """Get full token object with expiry information."""
        raise NotImplementedError


class ClerkDriveProvider(DriveProvider):
    """Google Drive provider using Clerk for OAuth token management."""

    def __init__(self, secret_key: Optional[str] = None) -> None:
        key = secret_key or os.getenv("CLERK_SECRET_KEY")
        if not key or Clerk is None:
            # In development, missing CLERK_SECRET_KEY is expected, so log at DEBUG level
            # In production, this would be a configuration error
            # Check for development indicators: FLASK_ENV, FLASK_DEBUG, or local env.json
            is_dev = (
                os.getenv("FLASK_ENV") == "development" 
                or os.getenv("FLASK_DEBUG") == "1"
                or os.path.exists(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "env.json"))  # Project root
                or os.path.exists(os.path.join(os.path.dirname(os.path.dirname(__file__)), "env.json"))  # Backend directory
            )
            if is_dev:
                logger.debug("ClerkDriveProvider not initialized; missing CLERK_SECRET_KEY or Clerk SDK (expected in development)")
            else:
                logger.warning("ClerkDriveProvider not initialized; missing CLERK_SECRET_KEY or Clerk SDK")
            self.client = None
        else:
            self.client = Clerk(bearer_auth=key)

    def get_token_object(self, user_id: str) -> Optional[Any]:
        """Return the OAuth token object for the user or None."""
        if not self.client:
            logger.error('🔗 [CLERK TOKEN] ❌ Clerk client not configured')
            return None

        try:
            # Windows-compatible timeout using threading
            result = [None]
            exception = [None]

            def clerk_api_call():
                try:
                    logger.info('🔗 [CLERK TOKEN] Calling Clerk API for user_id: %s', user_id)
                    result[0] = self.client.users.get_o_auth_access_token(
                        user_id=user_id, provider='oauth_google'
                    )
                    logger.info('🔗 [CLERK TOKEN] Clerk API call completed successfully')
                except Exception as e:
                    logger.error('🔗 [CLERK TOKEN] Exception in Clerk API call: %s', e, exc_info=True)
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
                logger.error('🔗 [CLERK TOKEN] ❌ Exception occurred: %s', exception[0])
                logger.error('🔗 [CLERK TOKEN] Exception type: %s', type(exception[0]).__name__)
                # Don't raise - return None so caller can handle gracefully
                return None

            tokens = result[0]

            if tokens and len(tokens) > 0:
                token_obj = tokens[0]
                logger.info('🔗 [CLERK TOKEN] ✅ Successfully retrieved token object')
                return token_obj
            else:
                logger.warning('🔗 [CLERK TOKEN] ⚠️ No tokens returned from Clerk (user may not have connected Google account)')
                return None

        except Exception as e:
            logger.error('🔗 [CLERK TOKEN] ❌ Failed to retrieve Google token from Clerk: %s', e, exc_info=True)
            logger.error('🔗 [CLERK TOKEN] Exception type: %s', type(e).__name__)
            return None

    def get_access_token(self, user_id: str) -> Optional[str]:
        """Get Google OAuth access token string."""
        token_obj = self.get_token_object(user_id)
        if token_obj and hasattr(token_obj, 'token'):
            return token_obj.token
        return None


class GoogleDriveIntegration:
    """Google Drive API integration wrapper."""

    def __init__(self, provider: DriveProvider) -> None:
        self.provider = provider

    def _get_headers(self, user_id: str) -> Dict[str, str]:
        """Get authorization headers for API requests."""
        token = self.provider.get_access_token(user_id)
        if not token:
            raise ValueError("No Google access token available")
        return {'Authorization': f'Bearer {token}'}

    def list_files(self, user_id: str, folder_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List files in Google Drive, optionally filtered by folder."""
        headers = self._get_headers(user_id)
        params = {
            'fields': 'files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink)'
        }
        if folder_id:
            params['q'] = f"'{folder_id}' in parents and trashed=false"

        response = requests.get(f'{GDRIVE_BASE}/files', headers=headers, params=params)
        response.raise_for_status()
        return response.json().get('files', [])

    def upload_file(
        self,
        user_id: str,
        file_content: bytes,
        filename: str,
        mimetype: str,
        folder_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload a file to Google Drive."""
        headers = self._get_headers(user_id)
        metadata = {'name': filename}
        if folder_id:
            metadata['parents'] = [folder_id]

        files = {
            'metadata': ('metadata', json.dumps(metadata), 'application/json; charset=UTF-8'),
            'file': (filename, file_content, mimetype)
        }

        response = requests.post(UPLOAD_URL, headers=headers, files=files)
        response.raise_for_status()
        return response.json()

    def download_file(self, user_id: str, file_id: str) -> tuple[bytes, str]:
        """Download a file from Google Drive."""
        headers = self._get_headers(user_id)
        response = requests.get(
            f'{GDRIVE_BASE}/files/{file_id}',
            headers=headers,
            params={'alt': 'media'},
            stream=True,
        )
        response.raise_for_status()
        content_type = response.headers.get('Content-Type', 'application/octet-stream')
        return response.content, content_type

    def delete_file(self, user_id: str, file_id: str) -> bool:
        """Delete a file from Google Drive."""
        headers = self._get_headers(user_id)
        response = requests.delete(f'{GDRIVE_BASE}/files/{file_id}', headers=headers)
        if response.status_code == 204:
            return True
        response.raise_for_status()
        return False

    def get_access_token_info(self, user_id: str) -> Dict[str, Any]:
        """Get access token with expiry information."""
        token_obj = self.provider.get_token_object(user_id)
        if not token_obj:
            raise ValueError("No Google token object available")
        if not hasattr(token_obj, 'token') or not token_obj.token:
            raise ValueError("Token object has no token")

        expires_in = 0
        expires_at = getattr(token_obj, 'expires_at', None)
        if expires_at is not None:
            try:
                exp_ts = int(float(expires_at))
            except (TypeError, ValueError):
                logger.warning("⚠️ Unexpected expires_at value: %r", expires_at)
                exp_ts = int(time.time())
            expires_in = max(0, exp_ts - int(time.time()))

        return {
            'access_token': token_obj.token,
            'expires_in': expires_in
        }

