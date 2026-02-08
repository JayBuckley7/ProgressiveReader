from __future__ import annotations

from abc import ABC, abstractmethod

from .schemas import (
    ValidateExamplesRequest,
    ValidateExamplesResponse,
    TeachExamplesRequest,
    TeachExamplesResponse,
)


class GrammarProvider(ABC):
    @abstractmethod
    def validate_examples(self, req: ValidateExamplesRequest) -> ValidateExamplesResponse:
        raise NotImplementedError

    @abstractmethod
    def teach_examples(self, req: TeachExamplesRequest) -> TeachExamplesResponse:
        raise NotImplementedError


__all__ = ["GrammarProvider"]

