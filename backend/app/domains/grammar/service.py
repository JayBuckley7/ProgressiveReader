from __future__ import annotations

from .integrations import GrammarProvider
from .schemas import ValidateExamplesRequest, ValidateExamplesResponse


class GrammarService:
    def __init__(self, provider: GrammarProvider) -> None:
        self._provider = provider

    def validate_examples(self, req: ValidateExamplesRequest) -> ValidateExamplesResponse:
        return self._provider.validate_examples(req)

