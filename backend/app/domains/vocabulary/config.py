from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class JpdbConfig:
    max_bytes_per_api_batch: int
    max_segments_per_api_batch: int
    token_fields: list[str]
    vocab_fields: list[str]
    api_url: str
    review_url: str


__all__ = ["JpdbConfig"]

