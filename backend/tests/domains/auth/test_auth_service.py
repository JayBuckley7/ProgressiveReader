from __future__ import annotations

from typing import Any, Dict, Optional, List

from app.domains.auth.ports import AuthProviderPort
from app.domains.auth.service import AuthService
from app.domains.auth.schemas import SessionInfo


class _MockProvider(AuthProviderPort):
    def __init__(self, user: Optional[dict] = None, admin_ids: Optional[set[str]] = None) -> None:
        self._user = user
        self._admin_ids = admin_ids or set()
        self._settings: dict[str, Any] = {}

    def verify_token(self, token: str) -> Optional[SessionInfo]:
        if token == "ok":
            return SessionInfo(user_id="u1", session_id="s1", status="verified")
        return None

    def get_current_user_from_headers(self, headers: Dict[str, str]) -> Optional[Any]:
        auth = headers.get("Authorization") or ""
        if auth.startswith("Bearer") and self._user:
            return self._user
        return None

    def is_admin(self, user_id: str) -> bool:
        return user_id in self._admin_ids

    def get_settings(self, user_id: str) -> Dict[str, Any]:
        return self._settings.get(user_id, {})

    def save_settings(self, user_id: str, settings: Dict[str, Any]) -> bool:
        self._settings[user_id] = settings
        return True

    def get_organization_memberships(self, user_id: str) -> List[Dict[str, Any]]:
        _ = user_id
        return []


def test_get_current_user_from_headers_present():
    provider = _MockProvider(user={"id": "u1"})
    service = AuthService(provider)
    user = service.get_current_user_from_headers({"Authorization": "Bearer ok"})
    assert user is not None
    assert user["id"] == "u1"


def test_get_current_user_from_headers_missing():
    provider = _MockProvider(user=None)
    service = AuthService(provider)
    user = service.get_current_user_from_headers({})
    assert user is None


def test_is_admin_flags():
    provider = _MockProvider(user={"id": "admin"}, admin_ids={"admin"})
    service = AuthService(provider)
    assert service.is_admin("admin") is True
    assert service.is_admin("user") is False
