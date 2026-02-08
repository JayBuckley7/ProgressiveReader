"""Drive service layer."""
from __future__ import annotations

from typing import Optional, List, Dict, Any
import logging

from .ports import DriveIntegrationPort
from .schemas import DriveFile

logger = logging.getLogger(__name__)


class DriveService:
    """Service layer for Drive operations."""

    def __init__(self, integration: DriveIntegrationPort) -> None:
        self.integration = integration

    def is_provider_configured(self) -> bool:
        return self.integration.is_provider_configured()

    def list_files(self, user_id: str, folder_id: Optional[str] = None) -> List[DriveFile]:
        """List files in Google Drive."""
        try:
            files = self.integration.list_files(user_id, folder_id)
            return [DriveFile(**file) for file in files]
        except Exception as e:
            logger.error(f"Error listing Drive files: {e}")
            raise

    def upload_file(
        self,
        user_id: str,
        file_content: bytes,
        filename: str,
        mimetype: str,
        folder_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload a file to Google Drive."""
        try:
            return self.integration.upload_file(user_id, file_content, filename, mimetype, folder_id)
        except Exception as e:
            logger.error(f"Error uploading file to Drive: {e}")
            raise

    def download_file(self, user_id: str, file_id: str) -> tuple[bytes, str]:
        """Download a file from Google Drive."""
        try:
            return self.integration.download_file(user_id, file_id)
        except Exception as e:
            logger.error(f"Error downloading file from Drive: {e}")
            raise

    def delete_file(self, user_id: str, file_id: str) -> bool:
        """Delete a file from Google Drive."""
        try:
            return self.integration.delete_file(user_id, file_id)
        except Exception as e:
            logger.error(f"Error deleting file from Drive: {e}")
            raise

    def get_access_token_info(self, user_id: str) -> Dict[str, Any]:
        """Get access token information."""
        try:
            return self.integration.get_access_token_info(user_id)
        except Exception as e:
            logger.error(f"Error getting access token info: {e}")
            raise

    def get_thumbnail(self, user_id: str, file_id: str, size: int = 420) -> tuple[bytes | None, str | None]:
        """Get thumbnail bytes + content type for a Drive file, if available."""
        try:
            return self.integration.get_thumbnail(user_id, file_id, size=size)
        except Exception as e:
            logger.error(f"Error getting Drive thumbnail: {e}")
            raise
