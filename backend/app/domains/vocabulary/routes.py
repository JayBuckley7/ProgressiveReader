"""Vocabulary domain routes."""
from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError

from ...utils.clerk_auth import require_auth, optional_auth, get_user_id
from .controller import VocabularyController
import logging

logger = logging.getLogger(__name__)

vocabulary_bp = Blueprint('vocabulary', __name__, url_prefix='/api')


@vocabulary_bp.route('/due-cards', methods=['POST'])
@require_auth
def due_cards():
    """Return JPDB due cards for the authenticated user."""
    data = request.get_json(silent=True) or {}
    service = current_app.extensions["container"].vocabulary_service
    controller = VocabularyController(service=service)
    try:
        cards = controller.due_cards(payload=data, cookie_header=request.headers.get("Cookie"))
        return jsonify(cards)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
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
    service = current_app.extensions["container"].vocabulary_service
    controller = VocabularyController(service=service)
    try:
        decks = controller.list_user_decks(
            payload=data,
            cookies=request.cookies,
            cookie_header=request.headers.get("X-JPDB-Cookie"),
        )
        return jsonify(decks)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except PermissionError as e:
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        current_app.logger.error(f"Error fetching user decks: {e}", exc_info=True)
        return jsonify({"error": "Failed to fetch decks from JPDB"}), 500


@vocabulary_bp.route('/jpdb/deck/list-vocabulary', methods=['POST'])
@require_auth
def jpdb_list_deck_vocabulary():
    """Proxy JPDB deck/list-vocabulary using the user's JPDB API key (stored in cookies)."""
    data = request.get_json(silent=True) or {}
    try:
        service = current_app.extensions["container"].vocabulary_service
        controller = VocabularyController(service=service)
        return jsonify(controller.jpdb_list_deck_vocabulary(payload=data, cookies=request.cookies))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 401
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error listing deck vocabulary: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 502


@vocabulary_bp.route('/jpdb/lookup-vocabulary', methods=['POST'])
@require_auth
def jpdb_lookup_vocabulary():
    """Proxy JPDB lookup-vocabulary using the user's JPDB API key (stored in cookies)."""
    data = request.get_json(silent=True) or {}

    try:
        service = current_app.extensions["container"].vocabulary_service
        controller = VocabularyController(service=service)
        return jsonify(controller.jpdb_lookup_vocabulary(payload=data, cookies=request.cookies))
    except ValueError as e:
        msg = str(e)
        status = 400 if msg.startswith("Missing") else 502
        return jsonify({"error": msg}), status
    except PermissionError as e:
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        current_app.logger.error(f"Error looking up vocabulary: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 502


@vocabulary_bp.route('/get-jpdb-data', methods=['POST'])
def get_jpdb_data():
    """Fetch token and vocabulary data from JPDB for text segments via service."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    service = current_app.extensions["container"].vocabulary_service
    try:
        controller = VocabularyController(service=service)
        return jsonify(controller.get_jpdb_data(payload=data))
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        current_app.logger.error(f"JPDB processing error: {e}", exc_info=True)
        return jsonify({"error": "Failed to process JPDB data"}), 500


@vocabulary_bp.route('/mine-jpdb-word', methods=['POST'])
def mine_jpdb_word():
    """Add a vocabulary word to a JPDB deck via service."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    service = current_app.extensions["container"].vocabulary_service
    try:
        controller = VocabularyController(service=service)
        result = controller.mine_jpdb_word(payload=data)
        status = 200 if result.get("success") is True else 502
        return jsonify(result), status
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        current_app.logger.error(f"JPDB mining failed: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 502


@vocabulary_bp.route('/update-jpdb-word-state', methods=['POST'])
def update_jpdb_word_state():
    """Update the study state of a JPDB vocabulary entry via service."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    service = current_app.extensions["container"].vocabulary_service
    try:
        controller = VocabularyController(service=service)
        return jsonify(controller.update_jpdb_word_state(payload=data))
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        current_app.logger.error(f"JPDB state update failed: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 502


@vocabulary_bp.route('/review-jpdb-card', methods=['POST'])
def review_jpdb_card():
    """Record a review rating for a JPDB vocabulary card via service."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    service = current_app.extensions["container"].vocabulary_service
    try:
        controller = VocabularyController(service=service)
        result = controller.review_jpdb_card(payload=data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        current_app.logger.error(f"JPDB request failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to contact JPDB'}), 500

    return jsonify(result)


@vocabulary_bp.route('/vocabulary', methods=['POST'])
@optional_auth
def add_vocabulary_word():
    """Add a vocabulary word to the user's collection."""
    try:
        data = request.get_json() or {}
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    
    user_id = get_user_id()
    service = current_app.extensions["container"].vocabulary_service

    try:
        controller = VocabularyController(service=service)
        body, status = controller.add_vocabulary_word(payload=data, user_id=user_id)
        return jsonify(body), status
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
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
        controller = VocabularyController(service=service)
        return jsonify(
            controller.get_user_vocabulary(
                user_id=user_id,
                language=language,
                mastered=mastered,
                book_id=book_id,
            )
        )
    except Exception as e:
        current_app.logger.error(f"Error fetching vocabulary: {e}", exc_info=True)
        return jsonify({'error': 'Failed to fetch vocabulary'}), 500


@vocabulary_bp.route('/vocabulary/<int:word_id>/mastered', methods=['PATCH'])
@optional_auth
def toggle_mastered(word_id: int):
    """Toggle mastered status for a vocabulary word."""
    try:
        data = request.get_json() or {}
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    
    user_id = get_user_id()
    service = current_app.extensions["container"].vocabulary_service
    
    try:
        controller = VocabularyController(service=service)
        vocab = controller.toggle_mastered(payload=data, user_id=user_id, word_id=word_id)
        if not vocab:
            return jsonify({'error': 'Vocabulary word not found or access denied'}), 404
        return jsonify(vocab)
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        current_app.logger.error(f"Error toggling mastered status: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update vocabulary word'}), 500
