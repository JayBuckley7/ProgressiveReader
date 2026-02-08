"""Vocabulary domain routes."""
from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError

from ...utils.clerk_auth import require_auth, optional_auth, get_user_id
from .http import get_jpdb_api_key_from_cookies_or_body
from .schemas import (
    GetJpdbDataRequest,
    MineWordRequest,
    UpdateWordStateRequest,
    ReviewCardRequest,
    AddVocabularyWordRequest,
    AddVocabularyWordResponse,
    ToggleMasteredRequest,
    ListUserDecksRequest,
)
import logging

logger = logging.getLogger(__name__)

vocabulary_bp = Blueprint('vocabulary', __name__, url_prefix='/api')


@vocabulary_bp.route('/due_cards', methods=['POST'])
@require_auth
def due_cards():
    """Return JPDB due cards for the authenticated user."""
    data = request.get_json(silent=True) or {}
    try:
        req = ListUserDecksRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400

    cookie_string = req.cookie or request.headers.get("Cookie")
    if not (req.username or req.password or cookie_string):
        return jsonify({"error": "Authentication required"}), 401

    service = current_app.extensions["container"].vocabulary_service
    try:
        cards = service.get_due_cards_with_auth(request=req, cookie_string=cookie_string)
        return jsonify([c.model_dump() for c in cards])
    except PermissionError:
        return jsonify({"error": "Authentication required"}), 401
    except Exception as e:
        current_app.logger.error(f"Error fetching due cards: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch cards"}), 400


@vocabulary_bp.route('/list-user-decks', methods=['POST'])
@require_auth
def list_user_decks():
    """List the user's JPDB decks with id, name, and word count."""
    data = request.get_json(silent=True) or {}
    try:
        req = ListUserDecksRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400

    cookie_string = req.cookie or request.headers.get("X-JPDB-Cookie")
    jpdb_api_key = get_jpdb_api_key_from_cookies_or_body(cookies=request.cookies, body=data)

    service = current_app.extensions["container"].vocabulary_service
    try:
        decks = service.list_user_decks_with_auth(
            request=req,
            cookie_string=cookie_string,
            jpdb_api_key=jpdb_api_key,
        )
        return jsonify([d.model_dump() for d in decks])
    except PermissionError as e:
        msg = str(e)
        status = 401 if "configured" in msg.lower() else 401
        return jsonify({"error": msg}), status
    except Exception as e:
        current_app.logger.error(f"Error fetching user decks: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch decks from JPDB"}), 500


@vocabulary_bp.route('/jpdb/deck/list-vocabulary', methods=['POST'])
@require_auth
def jpdb_list_deck_vocabulary():
    """Proxy JPDB deck/list-vocabulary using the user's JPDB API key (stored in cookies)."""
    data = request.get_json(silent=True) or {}
    deck_id = data.get("id")
    if deck_id is None or (isinstance(deck_id, str) and not deck_id.strip()):
        return jsonify({"error": "Missing deck id"}), 400
    if isinstance(deck_id, str):
        deck_id = deck_id.strip()
        if deck_id.isdigit():
            deck_id = int(deck_id)

    jpdb_api_key = get_jpdb_api_key_from_cookies_or_body(cookies=request.cookies, body=data)
    if not jpdb_api_key:
        return jsonify({"error": "JPDB API key not configured"}), 401

    try:
        service = current_app.extensions["container"].vocabulary_service
        vocab = service.list_deck_vocabulary_via_api_key(jpdb_api_key=jpdb_api_key, deck_id=deck_id)
        return jsonify({"vocabulary": vocab})
    except Exception as e:
        current_app.logger.error(f"Error listing deck vocabulary: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 502


@vocabulary_bp.route('/jpdb/lookup-vocabulary', methods=['POST'])
@require_auth
def jpdb_lookup_vocabulary():
    """Proxy JPDB lookup-vocabulary using the user's JPDB API key (stored in cookies)."""
    data = request.get_json(silent=True) or {}
    pairs = data.get("list")
    fields = data.get("fields")

    jpdb_api_key = get_jpdb_api_key_from_cookies_or_body(cookies=request.cookies, body=data)
    if not jpdb_api_key:
        return jsonify({"error": "JPDB API key not configured"}), 401

    try:
        service = current_app.extensions["container"].vocabulary_service
        combined = service.lookup_vocabulary_info_via_api_key(
            jpdb_api_key=jpdb_api_key,
            pairs=pairs,
            fields=fields,
            chunk_size=data.get("chunkSize") or 300,
        )
        return jsonify({"vocabulary_info": combined})
    except ValueError as e:
        msg = str(e)
        status = 400 if msg.startswith("Missing") else 502
        return jsonify({"error": msg}), status
    except Exception as e:
        current_app.logger.error(f"Error looking up vocabulary: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 502


@vocabulary_bp.route('/get_jpdb_data', methods=['POST'])
def get_jpdb_data():
    """Fetch token and vocabulary data from JPDB for text segments via service."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        req = GetJpdbDataRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    service = current_app.extensions["container"].vocabulary_service
    try:
        tokens = service.get_jpdb_data(request=req)
        return jsonify([t.model_dump() for t in tokens])
    except Exception as e:
        current_app.logger.error(f"JPDB processing error: {e}", exc_info=True)
        return jsonify({"error": "Failed to process JPDB data"}), 500


@vocabulary_bp.route('/mine_jpdb_word', methods=['POST'])
def mine_jpdb_word():
    """Add a vocabulary word to a JPDB deck via service."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        req = MineWordRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    service = current_app.extensions["container"].vocabulary_service
    try:
        result = service.mine_word(request=req)
        if isinstance(result, dict) and result.get("success") is True:
            return jsonify(result)
        # Normalize unexpected provider outputs.
        return jsonify({"success": False, "error": "JPDB mining failed"}), 502
    except Exception as e:
        current_app.logger.error(f"JPDB mining failed: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 502


@vocabulary_bp.route('/update_jpdb_word_state', methods=['POST'])
def update_jpdb_word_state():
    """Update the study state of a JPDB vocabulary entry via service."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        req = UpdateWordStateRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    service = current_app.extensions["container"].vocabulary_service
    try:
        new_state = service.update_word_state_with_predicted_state(request=req)
        return jsonify({"success": True, "newState": new_state})
    except Exception as e:
        current_app.logger.error(f"JPDB state update failed: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 502


@vocabulary_bp.route('/review_jpdb_card', methods=['POST'])
def review_jpdb_card():
    """Record a review rating for a JPDB vocabulary card via service."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        req = ReviewCardRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    service = current_app.extensions["container"].vocabulary_service
    try:
        new_state = service.review_card_with_predicted_state(request=req)
    except Exception as e:
        current_app.logger.error(f"JPDB request failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to contact JPDB'}), 500

    return jsonify({'success': True, 'newState': new_state})


@vocabulary_bp.route('/vocabulary', methods=['POST'])
@optional_auth
def add_vocabulary_word():
    """Add a vocabulary word to the user's collection."""
    try:
        data = request.get_json() or {}
        req = AddVocabularyWordRequest(**data)
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    
    user_id = get_user_id()
    service = current_app.extensions["container"].vocabulary_service
    
    try:
        vocab = service.add_vocabulary_word(request=req, user_id=user_id)
        response = AddVocabularyWordResponse(
            success=True,
            id=vocab.id,
            word=vocab.word,
            translation=vocab.translation,
            language=vocab.language,
        )
        return jsonify(response.model_dump()), 201
    except Exception as e:
        current_app.logger.error(f"Error adding vocabulary word: {e}", exc_info=True)
        return jsonify({'error': 'Failed to add vocabulary word'}), 500


@vocabulary_bp.route('/vocabulary', methods=['GET'])
@optional_auth
def get_user_vocabulary():
    """Get user's vocabulary words with optional filters."""
    user_id = get_user_id()
    language = request.args.get('language')
    mastered_param = request.args.get('mastered')
    book_id = request.args.get('bookId')
    
    mastered = None
    if mastered_param is not None:
        mastered = mastered_param.lower() == 'true'
    
    service = current_app.extensions["container"].vocabulary_service
    
    try:
        vocabulary = service.get_user_vocabulary(
            user_id=user_id,
            language=language,
            mastered=mastered,
            book_id=book_id,
        )
        return jsonify([v.model_dump() for v in vocabulary])
    except Exception as e:
        current_app.logger.error(f"Error fetching vocabulary: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch vocabulary'}), 500


@vocabulary_bp.route('/vocabulary/<int:word_id>/mastered', methods=['PATCH'])
@optional_auth
def toggle_mastered(word_id: int):
    """Toggle mastered status for a vocabulary word."""
    try:
        data = request.get_json() or {}
        req = ToggleMasteredRequest(**data)
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    
    user_id = get_user_id()
    service = current_app.extensions["container"].vocabulary_service
    
    try:
        vocab = service.toggle_mastered(user_id=user_id, word_id=word_id, mastered=req.mastered)
        if not vocab:
            return jsonify({'error': 'Vocabulary word not found or access denied'}), 404
        return jsonify(vocab.model_dump())
    except Exception as e:
        current_app.logger.error(f"Error toggling mastered status: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update vocabulary word'}), 500
