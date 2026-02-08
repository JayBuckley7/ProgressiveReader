from __future__ import annotations

from typing import Optional, Dict, List

from pydantic import BaseModel, Field


class MixRefineCandidate(BaseModel):
    """Candidate Japanese vocab entry for a given English gloss key."""

    id: str = Field(..., description="JPDB vocab id pair as a stable string (ex: '123/456').")
    spelling: str = Field(..., description="Japanese spelling (kanji/kana).")
    reading: Optional[str] = Field(default=None, description="Optional reading (kana).")
    meaning: Optional[str] = Field(default=None, description="Optional short meaning/gloss.")


class MixRefineRequest(BaseModel):
    """Request to refine ambiguous English->JPDB swap choices via an LLM."""

    text_sample: str = Field(..., description="Plain text excerpt of the chapter (no HTML).")
    ambiguous_keys: List[str] = Field(default_factory=list, description="English gloss keys to refine.")
    candidates_by_key: Dict[str, List[MixRefineCandidate]] = Field(
        default_factory=dict,
        description="Map glossKey -> up to a few candidate JPDB vocab entries.",
    )

    model: Optional[str] = Field(default="gpt-4o-mini", description="OpenAI model name.")
    api_key: Optional[str] = Field(default=None, description="Optional user-provided OpenAI API key override.")


class MixRefineResponse(BaseModel):
    """Response containing the chosen candidate id per glossKey (or null)."""

    choices: Dict[str, Optional[str]] = Field(default_factory=dict)
    model_used: Optional[str] = None


__all__ = [
    "MixRefineCandidate",
    "MixRefineRequest",
    "MixRefineResponse",
]

