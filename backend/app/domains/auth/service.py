from __future__ import annotations

from typing import Dict, Optional, List

from .ports import AuthProviderPort
from .schemas import UserInfo


class AuthService:
    def __init__(self, provider: AuthProviderPort) -> None:
        self._provider = provider

    def get_current_user_from_headers(self, headers: Dict[str, str]) -> Optional[UserInfo]:
        return self._provider.get_current_user_from_headers(headers)

    def verify_token(self, token: str):
        return self._provider.verify_token(token)

    def is_admin(self, user_id: str) -> bool:
        return self._provider.is_admin(user_id)

    def get_settings(self, user_id: str) -> Dict[str, Any]:
        """Get user settings."""
        return self._provider.get_settings(user_id)

    def save_settings(self, user_id: str, settings: Dict[str, Any]) -> bool:
        """Save user settings."""
        return self._provider.save_settings(user_id, settings)

    def get_organization_memberships(self, user_id: str) -> List[Dict[str, Any]]:
        """List org memberships (serializable)."""
        return self._provider.get_organization_memberships(user_id)
