from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional, Any, Dict, List


class DriveProvider(ABC):
    """Port for obtaining Google OAuth access tokens for a user."""

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if this provider is usable (SDK configured, secrets present, etc)."""
        raise NotImplementedError

    @abstractmethod
    def get_access_token(self, user_id: str) -> Optional[str]:
        raise NotImplementedError

    @abstractmethod
    def get_token_object(self, user_id: str) -> Optional[Any]:
        raise NotImplementedError


class DriveIntegrationPort(ABC):
    @abstractmethod
    def is_provider_configured(self) -> bool:
        """Return True if the underlying DriveProvider is configured."""
        raise NotImplementedError

    @abstractmethod
    def list_files(self, user_id: str, folder_id: Optional[str] = None) -> List[Dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def upload_file(
        self,
        user_id: str,
        file_content: bytes,
        filename: str,
        mimetype: str,
        folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def download_file(self, user_id: str, file_id: str) -> tuple[bytes, str]:
        raise NotImplementedError

    @abstractmethod
    def delete_file(self, user_id: str, file_id: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def get_access_token_info(self, user_id: str) -> Dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_thumbnail(self, user_id: str, file_id: str, size: int = 420) -> tuple[bytes | None, str | None]:
        raise NotImplementedError


__all__ = ["DriveProvider", "DriveIntegrationPort"]
