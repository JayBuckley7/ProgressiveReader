"""Books domain routes."""
from flask import Blueprint, Response, current_app, g, jsonify, request, session
from pydantic import ValidationError

from ...utils.clerk_auth import optional_auth
from .schemas import (
    GetBookmarksRequest,
    AddBookmarkRequest,
    Bookmark as BookmarkSchema,
    DeleteCachedTranslationRequest,
    ToggleJlptRequest,
    ToggleJlptResponse,
)

books_bp = Blueprint('books', __name__, url_prefix='/api')


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

    fetched = current_app.extensions["container"].books_service.lookup_cover_bytes(title)
    if fetched:
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
    books_service = current_app.extensions["container"].books_service
    bookmarks = books_service.get_bookmarks(book_id=req.bookId, user_id=user_id)

    return jsonify([b.model_dump() for b in bookmarks])


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
    books_service = current_app.extensions["container"].books_service
    bookmark = books_service.add_bookmark(
        book_id=req.bookId,
        chapter_index=req.chapterIndex,
        position=req.position,
        note=req.note,
        user_id=user_id,
    )

    return jsonify(bookmark.model_dump()), 201


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
    return jsonify(response.model_dump())
