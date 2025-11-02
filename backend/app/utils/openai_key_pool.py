"""OpenAI API key pool management for round-robin rotation."""
from typing import Optional


class OpenAIKeyPool:
    """Manages a pool of OpenAI API keys with round-robin rotation."""

    def __init__(self) -> None:
        self._keys: list[str] = []
        self._index = 0

    def add_key(self, key: str) -> None:
        """Add a key to the pool."""
        if key not in self._keys:
            self._keys.append(key)

    def remove_key(self, key: str) -> bool:
        """Remove a key from the pool. Returns True if key was found and removed."""
        try:
            self._keys.remove(key)
            return True
        except ValueError:
            return False

    def get_next_key(self) -> Optional[str]:
        """Return the next key from the pool using round-robin rotation."""
        if not self._keys:
            return None
        key = self._keys[self._index]
        self._index = (self._index + 1) % len(self._keys)
        return key

    def get_all_keys(self) -> list[str]:
        """Return all keys in the pool."""
        return self._keys.copy()

    def size(self) -> int:
        """Return the number of keys in the pool."""
        return len(self._keys)

    def is_configured(self) -> bool:
        """Return whether the pool has any keys."""
        return len(self._keys) > 0


# Global instance (can be initialized from app config)
_openai_key_pool = OpenAIKeyPool()


def get_openai_key_pool() -> OpenAIKeyPool:
    """Get the global OpenAI key pool instance."""
    return _openai_key_pool


def get_next_openai_key() -> Optional[str]:
    """Convenience function to get the next key from the global pool."""
    return _openai_key_pool.get_next_key()

