from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class JsonChatProvider(ABC):
    """Port for JSON-only chat completions."""

    @abstractmethod
    def chat_json(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.0,
    ) -> Any:
        raise NotImplementedError


__all__ = ["JsonChatProvider"]

