"""Outbound adapter: best-effort book cover lookup via public APIs.

This is intentionally *not* part of the core domain logic. It performs HTTP I/O
and therefore lives under adapters/.
"""

from __future__ import annotations

import logging
import re

import requests

from ..ports import CoverLookupPort

logger = logging.getLogger(__name__)


def _fetch_image_bytes(url: str) -> tuple[bytes, str] | None:
    try:
        resp = requests.get(
            url,
            timeout=4,
            headers={"User-Agent": "ProgressiveReader/cover-lookup"},
        )
    except Exception as exc:
        logger.warning("Cover lookup failed fetching image: %s", exc)
        return None

    if resp.status_code != 200:
        return None

    content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
    if not content_type.startswith("image/"):
        return None

    # Avoid downloading huge files (covers should be small).
    data = resp.content or b""
    if len(data) == 0 or len(data) > 8_000_000:
        return None

    return data, content_type


def _lookup_openlibrary_cover_url(title: str) -> str | None:
    try:
        resp = requests.get(
            "https://openlibrary.org/search.json",
            params={"title": title, "limit": 5},
            timeout=3,
            headers={"User-Agent": "ProgressiveReader/cover-lookup"},
        )
        if resp.status_code != 200:
            return None
        payload = resp.json() or {}
        docs = payload.get("docs") or []
        for doc in docs:
            if not isinstance(doc, dict):
                continue
            cover_id = doc.get("cover_i")
            if isinstance(cover_id, int):
                return f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
            isbns = doc.get("isbn")
            if isinstance(isbns, list) and isbns:
                isbn0 = isbns[0]
                if isinstance(isbn0, str) and isbn0.strip():
                    return f"https://covers.openlibrary.org/b/isbn/{isbn0.strip()}-L.jpg"
    except Exception as exc:
        logger.warning("OpenLibrary cover lookup failed: %s", exc)
        return None
    return None


def _lookup_google_books_cover_url(title: str, google_books_api_key: str | None) -> str | None:
    try:
        params = {"q": title, "printType": "books", "orderBy": "relevance", "maxResults": 5}
        if google_books_api_key:
            params["key"] = google_books_api_key

        resp = requests.get(
            "https://www.googleapis.com/books/v1/volumes",
            params=params,
            timeout=3,
            headers={"User-Agent": "ProgressiveReader/cover-lookup"},
        )
        if resp.status_code != 200:
            return None
        payload = resp.json() or {}
        items = payload.get("items") or []
        for item in items:
            if not isinstance(item, dict):
                continue
            info = item.get("volumeInfo") or {}
            if not isinstance(info, dict):
                continue
            links = info.get("imageLinks") or {}
            if not isinstance(links, dict):
                continue
            thumb = links.get("thumbnail") or links.get("smallThumbnail")
            if isinstance(thumb, str) and thumb.strip():
                return thumb.replace("http://", "https://")
    except Exception as exc:
        logger.warning("Google Books cover lookup failed: %s", exc)
        return None
    return None


def _lookup_itunes_cover_url(term: str) -> str | None:
    """
    Fallback for non-book uploads (lyrics, notes, etc).

    Uses Apple's iTunes Search API (no key required) and returns a higher-res artwork URL when possible.
    """
    try:
        resp = requests.get(
            "https://itunes.apple.com/search",
            params={"term": term, "media": "music", "entity": "album", "limit": 1},
            timeout=3,
            headers={"User-Agent": "ProgressiveReader/cover-lookup"},
        )
        if resp.status_code != 200:
            return None

        payload = resp.json() or {}
        results = payload.get("results") or []
        if not results or not isinstance(results, list):
            return None

        first = results[0] if results else None
        if not isinstance(first, dict):
            return None

        artwork = first.get("artworkUrl100") or first.get("artworkUrl60")
        if not isinstance(artwork, str) or not artwork.strip():
            return None

        # Attempt to upgrade to a larger thumbnail.
        upgraded = artwork.replace("100x100bb.jpg", "600x600bb.jpg").replace("60x60bb.jpg", "600x600bb.jpg")
        return upgraded.replace("http://", "https://")
    except Exception as exc:
        logger.warning("iTunes cover lookup failed: %s", exc)
        return None


def lookup_cover_bytes(title: str, *, google_books_api_key: str | None = None) -> tuple[bytes, str] | None:
    """Return (bytes, content_type) for a best-effort cover lookup by title."""
    title = (title or "").strip()
    if not title:
        return None

    normalized = " ".join(title.replace("_", " ").replace("-", " ").split())

    def _strip_suffix_patterns(value: str) -> str:
        cleaned = value
        cleaned = re.sub(r"\s*\(\d{4}-\d{2}-\d{2}\)\s*$", "", cleaned)
        cleaned = re.sub(r"\s*[\(\（][^()\（\）]{1,120}[\)\）]\s*$", "", cleaned)
        cleaned = re.sub(r"\s*[【\[].{1,120}[】\]]\s*$", "", cleaned)
        cleaned = re.sub(r"\s*[-–—|/].{1,120}\s*$", "", cleaned)
        return cleaned.strip()

    without_date = _strip_suffix_patterns(normalized)
    without_trailing_parens = _strip_suffix_patterns(without_date)

    def _truncate_query(value: str, limit: int = 120) -> str:
        cleaned = " ".join((value or "").split()).strip()
        if len(cleaned) <= limit:
            return cleaned
        cut = cleaned[:limit]
        if " " in cut:
            cut = cut.rsplit(" ", 1)[0].strip()
        return cut or cleaned[:limit].strip()

    def _first_words(value: str, count: int = 8) -> str:
        parts = " ".join((value or "").split()).strip().split(" ")
        return " ".join(parts[:count]).strip()

    query_candidates = [
        title,
        normalized,
        without_date,
        without_trailing_parens,
        _first_words(without_trailing_parens),
        _truncate_query(without_trailing_parens),
    ]

    # Drop duplicates, preserve order, and keep queries reasonably sized for upstream APIs.
    seen = set()
    uniq: list[str] = []
    for q in query_candidates:
        q = " ".join((q or "").split()).strip()
        if not q:
            continue
        if len(q) > 140:
            q = _truncate_query(q, 140)
        if q in seen:
            continue
        seen.add(q)
        uniq.append(q)
    query_candidates = uniq

    for query in query_candidates:
        url = _lookup_openlibrary_cover_url(query)
        if url:
            fetched = _fetch_image_bytes(url)
            if fetched:
                return fetched

        url = _lookup_google_books_cover_url(query, google_books_api_key)
        if url:
            fetched = _fetch_image_bytes(url)
            if fetched:
                return fetched

        url = _lookup_itunes_cover_url(query)
        if url:
            fetched = _fetch_image_bytes(url)
            if fetched:
                return fetched

    return None


class PublicApiCoverLookup(CoverLookupPort):
    def __init__(self, *, google_books_api_key: str | None = None) -> None:
        self._google_books_api_key = (google_books_api_key or "").strip() or None

    def lookup_cover_bytes(self, title: str) -> tuple[bytes, str] | None:
        return lookup_cover_bytes(title, google_books_api_key=self._google_books_api_key)


__all__ = ["lookup_cover_bytes", "PublicApiCoverLookup"]
