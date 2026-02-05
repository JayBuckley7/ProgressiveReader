"""Books domain routes."""
from flask import Blueprint, Response, current_app, g, jsonify, request, session
from pydantic import ValidationError
import os
import re
import requests

from ...utils.clerk_auth import optional_auth
from .service import BooksService
from .repository import BooksRepository
from .integrations import LocalDemoStorageProvider
from .schemas import (
    GetBookmarksRequest,
    AddBookmarkRequest,
    Bookmark as BookmarkSchema,
    DeleteCachedTranslationRequest,
    ToggleJlptRequest,
    ToggleJlptResponse,
)

books_bp = Blueprint('books', __name__, url_prefix='/api')

# Initialize service
books_repository = BooksRepository()
books_service = BooksService(books_repository, LocalDemoStorageProvider(None))


def _fetch_image_bytes(url: str) -> tuple[bytes, str] | None:
    try:
        resp = requests.get(
            url,
            timeout=4,
            headers={"User-Agent": "ProgressiveReader/cover-lookup"},
        )
    except Exception as exc:
        current_app.logger.warning("Cover lookup failed fetching image: %s", exc)
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
        current_app.logger.warning("OpenLibrary cover lookup failed: %s", exc)
        return None
    return None


def _lookup_google_books_cover_url(title: str) -> str | None:
    try:
        params = {"q": title, "printType": "books", "orderBy": "relevance", "maxResults": 5}
        api_key = (
            (os.environ.get("GOOGLE_BOOKS_API_KEY") or "").strip()
            or (os.environ.get("VITE_GAPI_KEY") or "").strip()
        )
        if api_key:
            params["key"] = api_key

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
        current_app.logger.warning("Google Books cover lookup failed: %s", exc)
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
        current_app.logger.warning("iTunes cover lookup failed: %s", exc)
        return None


@books_bp.route("/covers/lookup", methods=["GET"])
def cover_lookup():
    """
    Best-effort cover lookup by title.

    Returns image bytes directly so the frontend can `fetch(...).blob()` without CORS issues when
    later uploading the cover into the user's Google Drive.
    """
    title = (request.args.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Missing title"}), 400

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

    # Prefer sources that don't require keys, and only call fallbacks if needed.
    lookups = (_lookup_openlibrary_cover_url, _lookup_google_books_cover_url, _lookup_itunes_cover_url)
    for query in query_candidates:
        for lookup in lookups:
            url = lookup(query)
            if not url:
                continue
            fetched = _fetch_image_bytes(url)
            if not fetched:
                continue
            data, content_type = fetched
            response = Response(data, status=200, mimetype=content_type)
            response.headers["Cache-Control"] = "public, max-age=86400"
            return response

    # No match: return 204 so the frontend can fall back without noisy 404 console errors.
    return Response(status=204)


@books_bp.route('/bookmarks', methods=['GET'])
@optional_auth
def get_bookmarks():
    """Return bookmarks for the given book"""
    book_id = request.args.get('bookId')
    if not book_id:
        return jsonify({'error': 'Missing bookId'}), 400

    try:
        req = GetBookmarksRequest(bookId=book_id)
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400

    user_id = g.user.id if g.get('user') else None
    bookmarks = books_service.get_bookmarks(book_id=req.bookId, user_id=user_id)

    return jsonify([b.dict() for b in bookmarks])


@books_bp.route('/bookmarks', methods=['POST'])
@optional_auth
def add_bookmark():
    """Create a bookmark for the current user (if any)."""
    try:
        data = request.get_json() or {}
        req = AddBookmarkRequest(**data)
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400

    user_id = g.user.id if g.get('user') else None
    bookmark = books_service.add_bookmark(
        book_id=req.bookId,
        chapter_index=req.chapterIndex,
        position=req.position,
        note=req.note,
        user_id=user_id,
    )

    return jsonify(bookmark.dict()), 201


@books_bp.route('/delete_cached_translation', methods=['POST'])
def delete_cached_translation_route():
    """Acknowledge removal of cached translation on the client."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON payload'}), 400
        req = DeleteCachedTranslationRequest(**data)
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid JSON payload: {str(e)}'}), 400

    current_app.logger.info(
        (
            "Received signal to acknowledge deletion of cached translation for "
            f"item index: {req.item_index}."
        )
    )
    return jsonify({'success': True, 'message': 'Client-side cache deletion acknowledged.'})


@books_bp.route('/toggle_jlpt', methods=['POST'])
def toggle_jlpt():
    """Enable or disable JLPT highlighting in the session."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON payload'}), 400
        req = ToggleJlptRequest(**data)
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid JSON payload: {str(e)}'}), 400

    session['jlpt_highlighting_enabled'] = req.enabled
    current_app.logger.info(f"JLPT highlighting set to: {req.enabled}")
    response = ToggleJlptResponse(success=True, jlpt_highlighting_enabled=req.enabled)
    return jsonify(response.dict())
