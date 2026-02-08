"""Ports for resolving LLM API keys (user-provided vs server pool/config)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional


class ApiKeyPoolPort(ABC):
    """Port for a pool of API keys (e.g., server-managed OpenAI keys)."""

    @abstractmethod
    def add_key(self, key: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def remove_key(self, key: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def get_next_key(self) -> Optional[str]:
        raise NotImplementedError

    @abstractmethod
    def get_all_keys(self) -> list[str]:
        raise NotImplementedError

    @abstractmethod
    def size(self) -> int:
        raise NotImplementedError

    @abstractmethod
    def is_configured(self) -> bool:
        raise NotImplementedError


class ApiKeyResolverPort(ABC):
    """Port for selecting which API key a use-case should run with."""

    @abstractmethod
    def resolve(self, user_api_key: Optional[str], *, use_server_key: bool = True) -> Optional[str]:
        raise NotImplementedError

