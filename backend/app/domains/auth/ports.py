from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, List

from .schemas import SessionInfo


class AuthProviderPort(ABC):
    """Port for authentication + user settings retrieval."""

    @abstractmethod
    def verify_token(self, token: str) -> Optional[SessionInfo]:
        raise NotImplementedError

    @abstractmethod
    def get_current_user_from_headers(self, headers: Dict[str, str]) -> Optional[Any]:
        """Return a raw user object for compatibility, or None if not authenticated."""
        raise NotImplementedError

    @abstractmethod
    def is_admin(self, user_id: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def get_settings(self, user_id: str) -> Dict[str, Any]:
        """Get user settings (provider-specific storage)."""
        raise NotImplementedError

    @abstractmethod
    def save_settings(self, user_id: str, settings: Dict[str, Any]) -> bool:
        """Persist user settings."""
        raise NotImplementedError

    @abstractmethod
    def get_organization_memberships(self, user_id: str) -> List[Dict[str, Any]]:
        """List org memberships for debug/admin diagnostics (no raw SDK objects)."""
        raise NotImplementedError


__all__ = ["AuthProviderPort"]
