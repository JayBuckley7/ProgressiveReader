from __future__ import annotations

import re
from typing import Dict, Optional

from .ports import JsonChatProvider
from .prompts import build_refine_swaps_messages
from .schemas import MixRefineRequest, MixRefineResponse


def _split_sentences(text: str) -> list[str]:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if not cleaned:
        return []
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    return [p.strip() for p in parts if p.strip()]


def _pick_example_sentences(text: str, gloss_key: str, max_count: int) -> list[str]:
    sentences = _split_sentences(text)
    if not sentences:
        return []

    needle = (gloss_key or "").lower().strip()
    if not needle:
        return sentences[:max_count]

    hits: list[str] = []
    for s in sentences:
        if len(hits) >= max_count:
            break
        if needle in s.lower():
            hits.append(s)

    # If we didn't find enough contextual hits, just return the first few sentences.
    if len(hits) >= min(2, max_count):
        return hits
    return sentences[:max_count]


class MixService:
    def __init__(self, provider: JsonChatProvider) -> None:
        self._provider = provider

    def refine_swaps(self, req: MixRefineRequest) -> MixRefineResponse:
        model = (req.model or "gpt-4o-mini").strip() or "gpt-4o-mini"

        # Normalize + cap keys.
        raw_keys = req.ambiguous_keys or []
        keys: list[str] = []
        seen: set[str] = set()
        for k in raw_keys:
            k2 = (k or "").strip()
            if not k2 or k2 in seen:
                continue
            seen.add(k2)
            keys.append(k2)
            if len(keys) >= 30:
                break

        if not keys:
            return MixRefineResponse(choices={}, model_used=model)

        text_sample = (req.text_sample or "")[:4000]

        tasks = []
        allowed_ids_by_key: Dict[str, set[str]] = {}
        for gloss_key in keys:
            candidates = (req.candidates_by_key.get(gloss_key) or [])[:3]
            allowed_ids_by_key[gloss_key] = set(c.id for c in candidates if isinstance(c.id, str) and c.id)
            tasks.append(
                {
                    "glossKey": gloss_key,
                    "examples": _pick_example_sentences(text_sample, gloss_key, 5),
                    "candidates": [
                        {
                            "id": c.id,
                            "spelling": c.spelling,
                            "reading": c.reading or "",
                            "meaning": c.meaning or "",
                        }
                        for c in candidates
                        if c.id and c.spelling
                    ],
                }
            )

        data = self._provider.chat_json(
            model=model,
            messages=build_refine_swaps_messages(text_sample=text_sample, tasks=tasks),
            temperature=0.0,
        )

        raw_choices: Dict[str, Optional[str]] | None = None
        try:
            parsed = MixRefineResponse.model_validate(data, strict=True)
            raw_choices = parsed.choices
        except Exception:
            raw_choices = None

        if not isinstance(raw_choices, dict):
            return MixRefineResponse(choices={k: None for k in keys}, model_used=model)

        out: Dict[str, Optional[str]] = {k: None for k in keys}
        for gloss_key in keys:
            v = raw_choices.get(gloss_key)
            if v is None:
                out[gloss_key] = None
                continue
            if isinstance(v, str) and v.strip():
                candidate_id = v.strip()
                allowed = allowed_ids_by_key.get(gloss_key) or set()
                if candidate_id in allowed:
                    out[gloss_key] = candidate_id

        return MixRefineResponse(choices=out, model_used=model)


__all__ = ["MixService"]
