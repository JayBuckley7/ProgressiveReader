from __future__ import annotations

import json
import re
from typing import Dict, Optional

from .ports import JsonChatProvider
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

        payload = []
        allowed_ids_by_key: Dict[str, set[str]] = {}
        for gloss_key in keys:
            candidates = (req.candidates_by_key.get(gloss_key) or [])[:3]
            allowed_ids_by_key[gloss_key] = set(c.id for c in candidates if isinstance(c.id, str) and c.id)
            payload.append(
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

        system = (
            "You choose the best Japanese vocabulary candidate for each English noun phrase in context. "
            "Return STRICT JSON only, no prose, no markdown."
        )

        user = (
            "Given the following English context and candidate Japanese words, pick the best replacement for each glossKey. "
            "If none fit, set it to null.\n\n"
            "Return JSON in this exact shape:\n"
            '{ "choices": { "glossKey": "vid/sid or null", "...": null } }\n\n'
            f"Context (excerpt):\n{text_sample}\n\n"
            f"Tasks:\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n"
        )

        data = self._provider.chat_json(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.0,
        )

        raw_choices = data.get("choices") if isinstance(data, dict) else None
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
