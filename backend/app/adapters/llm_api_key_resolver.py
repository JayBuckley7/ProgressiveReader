"""Default API key resolver for LLM providers (user key vs server key pool)."""

from __future__ import annotations

from typing import Optional

from ..core.llm_keys import ApiKeyPoolPort, ApiKeyResolverPort


class DefaultApiKeyResolver(ApiKeyResolverPort):
    def __init__(self, *, pool: ApiKeyPoolPort, fallback_key: Optional[str] = None) -> None:
        self._pool = pool
        self._fallback_key = (fallback_key or "").strip() or None

    def resolve(self, user_api_key: Optional[str], *, use_server_key: bool = True) -> Optional[str]:
        if user_api_key and user_api_key.strip():
            return user_api_key.strip()

        if not use_server_key:
            return None

        key = self._pool.get_next_key()
        if key:
            return key
        return self._fallback_key


__all__ = ["DefaultApiKeyResolver"]

