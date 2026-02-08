from __future__ import annotations

from .ports import GrammarProvider
from .schemas import (
    ValidateExamplesRequest,
    ValidateExamplesResponse,
    TeachExamplesRequest,
    TeachExamplesResponse,
)

MAX_CANDIDATES = 30
MAX_SENTENCE_CHARS = 300
MAX_TEACH_EXAMPLES = 3


class GrammarService:
    def __init__(self, provider: GrammarProvider) -> None:
        self._provider = provider

    def validate_examples(self, req: ValidateExamplesRequest) -> ValidateExamplesResponse:
        if not req.candidates:
            return ValidateExamplesResponse(matches=[])

        if len(req.candidates) > MAX_CANDIDATES:
            raise ValueError(f"Too many candidates (max {MAX_CANDIDATES})")

        for c in req.candidates:
            if not c.sentence or len(c.sentence) > MAX_SENTENCE_CHARS:
                raise ValueError(f"Candidate sentence too long (max {MAX_SENTENCE_CHARS} chars)")
            if c.before and len(c.before) > MAX_SENTENCE_CHARS:
                raise ValueError(f"Candidate before too long (max {MAX_SENTENCE_CHARS} chars)")
            if c.after and len(c.after) > MAX_SENTENCE_CHARS:
                raise ValueError(f"Candidate after too long (max {MAX_SENTENCE_CHARS} chars)")

        return self._provider.validate_examples(req)

    def teach_examples(self, req: TeachExamplesRequest) -> TeachExamplesResponse:
        if not req.examples:
            return TeachExamplesResponse(teachings=[])

        if len(req.examples) > MAX_TEACH_EXAMPLES:
            raise ValueError(f"Too many examples (max {MAX_TEACH_EXAMPLES})")

        for ex in req.examples:
            if not ex.sentence or len(ex.sentence) > MAX_SENTENCE_CHARS:
                raise ValueError(f"Example sentence too long (max {MAX_SENTENCE_CHARS} chars)")

        return self._provider.teach_examples(req)
