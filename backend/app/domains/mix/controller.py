"""Inbound controller for mix routes (keeps Flask routes thin)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from ...core.llm_keys import ApiKeyResolverPort
from ...utils.request_normalization import normalize_aliases
from .schemas import MixRefineRequest, MixRefineResponse
from .service import MixService


@dataclass(frozen=True)
class MixController:
    openai_key_resolver: ApiKeyResolverPort
    make_mix_service: Callable[[str], MixService]

    def refine_swaps(self, payload: dict[str, Any]) -> MixRefineResponse:
        if not payload:
            raise ValueError("Invalid JSON payload")

        normalize_aliases(
            payload,
            {
                "text_sample": ["textSample"],
                "ambiguous_keys": ["ambiguousKeys"],
                "candidates_by_key": ["candidatesByKey"],
                "api_key": ["apiKey"],
                "model": ["modelName"],
            },
        )

        req = MixRefineRequest(**payload)

        api_key_to_use = self.openai_key_resolver.resolve(req.api_key, use_server_key=True)
        if not api_key_to_use:
            raise ValueError("OpenAI API key not configured")

        service = self.make_mix_service(api_key_to_use)
        return service.refine_swaps(req)


__all__ = ["MixController"]

