"""Books domain routes."""
from flask import Blueprint, request, jsonify, g, session, current_app
from pydantic import ValidationError

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

