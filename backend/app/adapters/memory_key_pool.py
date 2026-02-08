"""In-memory API key pool adapter (round-robin)."""

from __future__ import annotations

from typing import Optional

from ..core.llm_keys import ApiKeyPoolPort


class InMemoryApiKeyPool(ApiKeyPoolPort):
    """Manages a pool of API keys with round-robin rotation."""

    def __init__(self) -> None:
        self._keys: list[str] = []
        self._index = 0

    def add_key(self, key: str) -> None:
        key = (key or "").strip()
        if not key:
            return
        if key not in self._keys:
            self._keys.append(key)

    def remove_key(self, key: str) -> bool:
        key = (key or "").strip()
        if not key:
            return False
        try:
            self._keys.remove(key)
            # Keep index in-bounds.
            if self._keys:
                self._index %= len(self._keys)
            else:
                self._index = 0
            return True
        except ValueError:
            return False

    def get_next_key(self) -> Optional[str]:
        if not self._keys:
            return None
        key = self._keys[self._index]
        self._index = (self._index + 1) % len(self._keys)
        return key

    def get_all_keys(self) -> list[str]:
        return self._keys.copy()

    def size(self) -> int:
        return len(self._keys)

    def is_configured(self) -> bool:
        return bool(self._keys)


__all__ = ["InMemoryApiKeyPool"]

