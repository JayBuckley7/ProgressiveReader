"""Kanji domain schemas."""
from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel, Field, field_validator


class KanjiSearchRequest(BaseModel):
    query: str = Field(..., description="Search query (kanji character or meaning)")


class KanjiSearchResult(BaseModel):
    kanji: str
    meanings: List[str]
    jlpt: Optional[int] = None
    # Add other kanji fields as needed


class KanjiSearchResponse(BaseModel):
    results: List[KanjiSearchResult]


class UpdateKanjiJlptRequest(BaseModel):
    kanji: str = Field(..., description="Single kanji character")
    jlpt_level: Optional[int] = Field(None, description="JLPT level (1-5) or null")

    @field_validator('kanji')
    @classmethod
    def validate_kanji(cls, v: str) -> str:
        if len(v) != 1:
            raise ValueError('kanji must be exactly one character')
        return v

    @field_validator('jlpt_level')
    @classmethod
    def validate_jlpt(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 1 or v > 5):
            raise ValueError('jlpt_level must be between 1-5 or null')
        return v


class UpdateKanjiJlptResponse(BaseModel):
    success: bool
    kanji: str
    old_jlpt: Optional[int]
    new_jlpt: Optional[int]


