"""Admin domain service for OpenAI key management and admin operations."""
from __future__ import annotations

from typing import Optional, Dict, Any, List

from .schemas import (
    AddOpenAIKeyRequest,
    RemoveOpenAIKeyRequest,
    AdminStatusResponse,
    OpenAIKeyStatusResponse,
    OpenAIKeyOperationResponse,
    OpenAIKeyListResponse,
)
from ...core.llm_keys import ApiKeyPoolPort
from ..auth.ports import AuthProviderPort


class AdminService:
    """Service for admin operations including OpenAI key management."""

    def __init__(
        self,
        key_pool: ApiKeyPoolPort,
        auth_provider: AuthProviderPort,
        *,
        fallback_key: Optional[str] = None,
    ):
        self._key_pool = key_pool
        self._auth_provider = auth_provider
        self._fallback_key = (fallback_key or "").strip() or None

    def add_openai_key(self, request: AddOpenAIKeyRequest) -> OpenAIKeyOperationResponse:
        """Add an OpenAI API key to the rotation pool."""
        self._key_pool.add_key(request.key)
        return OpenAIKeyOperationResponse(
            success=True,
            pool_size=self._key_pool.size()
        )

    def remove_openai_key(self, request: RemoveOpenAIKeyRequest) -> OpenAIKeyOperationResponse:
        """Remove an OpenAI API key from the rotation pool."""
        removed = self._key_pool.remove_key(request.key)
        if not removed:
            raise ValueError("Key not found")
        return OpenAIKeyOperationResponse(
            success=True,
            pool_size=self._key_pool.size()
        )

    def list_openai_keys(self) -> OpenAIKeyListResponse:
        """List all OpenAI API keys in the pool."""
        return OpenAIKeyListResponse(
            keys=self._key_pool.get_all_keys()
        )

    def get_openai_key_status(self) -> OpenAIKeyStatusResponse:
        """Get the status of OpenAI key configuration."""
        configured = self._key_pool.is_configured() or bool(self._fallback_key)
        return OpenAIKeyStatusResponse(
            openai_key_configured=configured,
            pool_size=self._key_pool.size()
        )

    def get_admin_status(
        self,
        user_id: str,
        is_admin_func,
    ) -> AdminStatusResponse:
        """Get admin status and organization memberships for a user."""
        debug_info: Dict[str, Any] = {
            "user_id": user_id,
            "is_admin": is_admin_func(user_id),
            "memberships": []
        }

        try:
            debug_info["memberships"] = self._auth_provider.get_organization_memberships(user_id)
        except Exception as e:
            debug_info["error"] = str(e)

        return AdminStatusResponse(**debug_info)
