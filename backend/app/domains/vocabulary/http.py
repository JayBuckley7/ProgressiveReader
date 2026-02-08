"""Inbound HTTP helpers for the vocabulary domain.

Routes should stay thin; keep any HTTP-ish parsing helpers here (not in services).
"""

from __future__ import annotations

from typing import Any, Mapping, Optional


def get_jpdb_api_key_from_cookies_or_body(
    *,
    cookies: Mapping[str, str],
    body: Optional[Mapping[str, Any]] = None,
) -> str | None:
    """Extract JPDB API key from cookies or request body (best-effort).

    We intentionally do NOT use Authorization header because it's already used
    for Clerk session auth in this app.
    """
    def _strip(v: object) -> str:
        return v.strip() if isinstance(v, str) else ""

    key = (
        _strip(cookies.get("jpdbApiKey"))
        or _strip(cookies.get("jpdb_api_key"))
        or _strip(cookies.get("JPDB_API_KEY"))
    )
    if key:
        return key

    data = body or {}
    for k in ("jpdbApiKey", "jpdb_api_key", "JPDB_API_KEY"):
        v = data.get(k) if isinstance(data, Mapping) else None
        v2 = _strip(v)
        if v2:
            return v2
    return None


__all__ = ["get_jpdb_api_key_from_cookies_or_body"]

