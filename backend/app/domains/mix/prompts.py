from __future__ import annotations

import json
from typing import Any


def build_refine_swaps_system_prompt() -> str:
    # Keep this in one place: changing behavior should not require spelunking through service logic.
    return (
        "You choose the best Japanese vocabulary candidate for each English noun phrase in context. "
        "Return STRICT JSON only, no prose, no markdown."
    )


def build_refine_swaps_user_prompt(*, text_sample: str, tasks: list[dict[str, Any]]) -> str:
    # A single prompt builder makes it easier to audit/iterate without mixing concerns in MixService.
    return (
        "Given the following English context and candidate Japanese words, pick the best replacement for each glossKey. "
        "If none fit, set it to null.\n\n"
        "Return JSON in this exact shape:\n"
        '{ "choices": { "glossKey": "vid/sid or null", "...": null } }\n\n'
        f"Context (excerpt):\n{(text_sample or '').strip()}\n\n"
        f"Tasks:\n{json.dumps(tasks, ensure_ascii=False, indent=2)}\n"
    )


def build_refine_swaps_messages(*, text_sample: str, tasks: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": build_refine_swaps_system_prompt()},
        {"role": "user", "content": build_refine_swaps_user_prompt(text_sample=text_sample, tasks=tasks)},
    ]


__all__ = [
    "build_refine_swaps_messages",
    "build_refine_swaps_system_prompt",
    "build_refine_swaps_user_prompt",
]

