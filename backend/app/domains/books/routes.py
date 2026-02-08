"""Books domain routes."""
from flask import Blueprint, Response, current_app, g, jsonify, request, session
from pydantic import ValidationError

from ...utils.clerk_auth import optional_auth
from .controller import BooksController

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

    user_id = g.user.id if g.get('user') else None
    controller = BooksController(current_app.extensions["container"].books_service)
    try:
        return jsonify(controller.get_bookmarks(book_id=book_id, user_id=user_id))
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400


@books_bp.route('/bookmarks', methods=['POST'])
@optional_auth
def add_bookmark():
    """Create a bookmark for the current user (if any)."""
    try:
        data = request.get_json() or {}
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400

    user_id = g.user.id if g.get('user') else None
    controller = BooksController(current_app.extensions["container"].books_service)
    try:
        bookmark = controller.add_bookmark(payload=data, user_id=user_id)
        return jsonify(bookmark), 201
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400


@books_bp.route('/toggle-jlpt', methods=['POST'])
def toggle_jlpt():
    """Enable or disable JLPT highlighting in the session."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON payload'}), 400
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid JSON payload: {str(e)}'}), 400

    controller = BooksController(current_app.extensions["container"].books_service)
    try:
        response = controller.toggle_jlpt(payload=data, session_store=session)
        current_app.logger.info(f"JLPT highlighting set to: {response.jlpt_highlighting_enabled}")
        return jsonify(response.model_dump())
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid JSON payload: {str(e)}'}), 400
