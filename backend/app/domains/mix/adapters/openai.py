from __future__ import annotations

import json
from typing import Any, Optional

from openai import OpenAI

from ..ports import JsonChatProvider


class OpenAIJsonChatProvider(JsonChatProvider):
    """OpenAI adapter for JSON-only chat completions."""

    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key

    def chat_json(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.0,
    ) -> Any:
        client = OpenAI(api_key=self._api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            response_format={"type": "json_object"},
        )

        content = (completion.choices[0].message.content or "").strip()
        if not content:
            return {}

        # response_format should guarantee JSON, but keep a defensive fallback.
        try:
            return json.loads(content)
        except Exception:
            start = content.find("{")
            end = content.rfind("}")
            if start >= 0 and end > start:
                return json.loads(content[start : end + 1])
            raise


__all__ = ["OpenAIJsonChatProvider"]

