"""Inbound controller for grammar routes (keeps Flask routes thin)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from ...core.llm_keys import ApiKeyResolverPort
from ...utils.request_normalization import normalize_aliases
from .schemas import ValidateExamplesRequest, TeachExamplesRequest, ValidateExamplesResponse, TeachExamplesResponse
from .service import GrammarService


@dataclass(frozen=True)
class GrammarController:
    openai_key_resolver: ApiKeyResolverPort
    make_grammar_service: Callable[[str], GrammarService]

    def validate_examples(self, payload: dict[str, Any]) -> ValidateExamplesResponse:
        if not payload:
            raise ValueError("Invalid JSON payload")

        normalize_aliases(payload, {"apiKey": ["api_key"], "maxResults": ["max_results"]})
        req = ValidateExamplesRequest(**payload)

        api_key_to_use = self.openai_key_resolver.resolve(req.apiKey, use_server_key=True)
        if not api_key_to_use:
            raise ValueError("OpenAI API key not configured")

        service = self.make_grammar_service(api_key_to_use)
        return service.validate_examples(req)

    def teach_examples(self, payload: dict[str, Any]) -> TeachExamplesResponse:
        if not payload:
            raise ValueError("Invalid JSON payload")

        normalize_aliases(payload, {"apiKey": ["api_key"]})
        req = TeachExamplesRequest(**payload)

        api_key_to_use = self.openai_key_resolver.resolve(req.apiKey, use_server_key=True)
        if not api_key_to_use:
            raise ValueError("OpenAI API key not configured")

        service = self.make_grammar_service(api_key_to_use)
        return service.teach_examples(req)


__all__ = ["GrammarController"]

