"""Helpers for normalizing incoming JSON payloads.

Routes sometimes accept multiple naming conventions (snake_case vs camelCase).
Centralize that logic to avoid copy/paste drift across endpoints.
"""

from __future__ import annotations

from typing import Any, Mapping


def normalize_aliases(data: dict[str, Any], aliases: Mapping[str, list[str]]) -> dict[str, Any]:
    """Normalize JSON keys in-place.

    For each canonical key, if it is missing and any alias is present, move the alias
    value into the canonical key (pop).
    """
    for canonical, variants in aliases.items():
        if canonical in data:
            continue
        for variant in variants:
            if variant in data:
                data[canonical] = data.pop(variant)
                break
    return data

