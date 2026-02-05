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
                logger.info(f'🔗 [CLERK TOKEN] ✅ Retrieved {len(tokens)} token objects')
                
                # Check for a valid token in the list
                current_time = time.time()
                valid_token = None
                
                for t in tokens:
                    try:
                        exp = getattr(t, 'expires_at', None)
                        if exp:
                            exp_ts = float(exp)
                            # Normalize milliseconds to seconds
                            if exp_ts > 1000000000000:
                                exp_ts = exp_ts / 1000
                            
                            if exp_ts > current_time:
                                logger.info('🔗 [CLERK TOKEN] Found valid token (expires in future)')
                                valid_token = t
                                break
                    except Exception:
                        continue
                
                if valid_token:
                    return valid_token
                
                logger.warning('🔗 [CLERK TOKEN] ⚠️ No valid future token found, returning first token')
                return tokens[0]
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
        q_parts = ["trashed=false"]
        # When no folder is specified, default to listing the Drive root folder.
        # This matches typical "library root" UX and avoids returning the entire Drive corpus.
        if folder_id and folder_id != "root":
            q_parts.append(f"'{folder_id}' in parents")
        else:
            q_parts.append("'root' in parents")

        params = {
            'fields': 'nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink,thumbnailLink,hasThumbnail)',
            'pageSize': 1000,
            'q': " and ".join(q_parts),
        }

        all_files: List[Dict[str, Any]] = []
        page_token: Optional[str] = None
        while True:
            if page_token:
                params['pageToken'] = page_token
            else:
                params.pop('pageToken', None)

            response = requests.get(f'{GDRIVE_BASE}/files', headers=headers, params=params)
            response.raise_for_status()
            data = response.json()

            all_files.extend(data.get('files', []))
            page_token = data.get('nextPageToken')
            if not page_token:
                break

        return all_files

    def get_thumbnail(self, user_id: str, file_id: str, size: int = 420) -> tuple[Optional[bytes], Optional[str]]:
        """Fetch a Drive thumbnail image for the file, if available."""
        token = self.provider.get_access_token(user_id)
        if not token:
            raise ValueError("No Google access token available")

        headers = {'Authorization': f'Bearer {token}'}
        meta_res = requests.get(
            f'{GDRIVE_BASE}/files/{file_id}',
            headers=headers,
            params={'fields': 'thumbnailLink,hasThumbnail'},
            timeout=15,
        )
        meta_res.raise_for_status()
        meta = meta_res.json()

        thumb_link = meta.get('thumbnailLink')
        if not thumb_link:
            return None, None

        url = self._normalize_thumbnail_url(thumb_link, size=size)

        # Try fetching with Authorization header first; fall back to access_token query parameter.
        img_res = requests.get(url, headers=headers, allow_redirects=True, timeout=15)
        if img_res.status_code in (401, 403):
            sep = '&' if '?' in url else '?'
            img_res = requests.get(f'{url}{sep}access_token={token}', allow_redirects=True, timeout=15)

        if img_res.status_code == 404:
            return None, None
        img_res.raise_for_status()

        content_type = img_res.headers.get('Content-Type') or 'image/jpeg'
        return img_res.content, content_type

    def _normalize_thumbnail_url(self, url: str, size: int) -> str:
        """Best-effort adjust Drive thumbnail URL to requested size."""
        try:
            import re

            # Common patterns: ...=s220 or ...=w256-h256 or ...sz=s220
            url = re.sub(r"=s\\d+", f"=s{size}", url)
            url = re.sub(r"sz=s\\d+", f"sz=s{size}", url)
            url = re.sub(r"=w\\d+-h\\d+", f"=w{size}-h{size}", url)
            return url
        except Exception:
            return url

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

        # Default to 1 hour if expiry is missing (standard for OAuth)
        expires_in = 3600
        expires_at = getattr(token_obj, 'expires_at', None)
        if expires_at is not None:
            try:
                exp_ts = int(float(expires_at))
                # If expires_at is clearly a timestamp (large number)
                if exp_ts > 1000000000000:  # Milliseconds (13 digits)
                    expires_in = max(0, int(exp_ts / 1000) - int(time.time()))
                elif exp_ts > 1000000000:  # Seconds (10 digits)
                    expires_in = max(0, exp_ts - int(time.time()))
                else:
                     # Maybe it's seconds remaining property misnamed?
                     expires_in = exp_ts
            except (TypeError, ValueError):
                logger.warning("⚠️ Unexpected expires_at value: %r", expires_at)
                # Keep default 3600
        
        return {
            'access_token': token_obj.token,
            'expires_in': expires_in
        }
