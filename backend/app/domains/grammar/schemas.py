from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional, List


class GrammarInfo(BaseModel):
    id: str = Field(..., description="Grammar point id (e.g. n5:ている)")
    title: str = Field(..., description="Grammar point title")
    meaning: str = Field(..., description="Short English meaning")
    level: str = Field(..., description="JLPT level (n5..n1)")


class Span(BaseModel):
    start: int = Field(..., ge=0)
    end: int = Field(..., ge=0)
    text: Optional[str] = None


class GrammarValidateCandidate(BaseModel):
    id: str
    sentence: str
    before: Optional[str] = None
    after: Optional[str] = None
    hintSpan: Optional[Span] = None


class ValidateExamplesRequest(BaseModel):
    grammar: GrammarInfo
    candidates: List[GrammarValidateCandidate]
    maxResults: int = Field(default=3, ge=1, le=3)
    model: str = Field(default="gpt-4o-mini")
    apiKey: Optional[str] = Field(default=None)


class GrammarValidateMatch(BaseModel):
    candidateId: str
    isMatch: bool
    confidence: Optional[float] = None
    matchSpan: Optional[Span] = None
    explanation: Optional[str] = None


class ValidateExamplesResponse(BaseModel):
    matches: List[GrammarValidateMatch]


class TeachExampleIn(BaseModel):
    exampleId: str
    sentence: str
    before: Optional[str] = None
    after: Optional[str] = None
    matchSpan: Optional[Span] = None


class TeachExamplesRequest(BaseModel):
    grammar: GrammarInfo
    examples: List[TeachExampleIn]
    model: str = Field(default="gpt-4o-mini")
    apiKey: Optional[str] = Field(default=None)


class TeachExampleOut(BaseModel):
    exampleId: str
    translation: Optional[str] = None
    breakdown: Optional[str] = None
    usageNote: Optional[str] = None
    contrast: Optional[dict] = None  # {alternative: string, note: string}


class TeachExamplesResponse(BaseModel):
    teachings: List[TeachExampleOut]


__all__ = [
    "GrammarInfo",
    "Span",
    "GrammarValidateCandidate",
    "ValidateExamplesRequest",
    "GrammarValidateMatch",
    "ValidateExamplesResponse",
    "TeachExampleIn",
    "TeachExamplesRequest",
    "TeachExampleOut",
    "TeachExamplesResponse",
]
