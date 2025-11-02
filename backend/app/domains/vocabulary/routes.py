"""Vocabulary domain routes."""
from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError

from ...utils.clerk_auth import require_auth, optional_auth, get_user_id
from ...domains.drive.integrations import ClerkDriveProvider
from .service import VocabularyService
from .integrations import JpdbModuleProvider, JpdbHttpProvider
from .schemas import (
    GetJpdbDataRequest,
    MineWordRequest,
    UpdateWordStateRequest,
    ReviewCardRequest,
    AddVocabularyWordRequest,
    AddVocabularyWordResponse,
    FetchDueCardsGoogleOAuthRequest,
    ToggleMasteredRequest,
    Vocabulary as VocabularySchema,
)
import os
import logging

logger = logging.getLogger(__name__)

vocabulary_bp = Blueprint('vocabulary', __name__, url_prefix='/api')

# Initialize drive provider for Google OAuth token access
drive_provider = ClerkDriveProvider(secret_key=os.getenv('CLERK_SECRET_KEY'))


@vocabulary_bp.route('/due_cards', methods=['POST'])
@require_auth
def due_cards():
    """Return JPDB due cards for the authenticated user."""
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    password = data.get('password')
    cookie = data.get('cookie') or request.headers.get('Cookie')

    if not (username or password or cookie):
        return jsonify({'error': 'Authentication required'}), 401

    service = VocabularyService(JpdbModuleProvider())
    cards = service.get_due_cards(username=username, password=password, cookie_string=cookie)
    if cards is None or (isinstance(cards, list) and not cards):
        return jsonify({'error': 'Failed to fetch cards'}), 400

    return jsonify([c.dict() for c in cards])


@vocabulary_bp.route('/list-user-decks', methods=['POST'])
@require_auth
def list_user_decks():
    """List the user's JPDB decks with id, name, and word count."""
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    password = data.get('password')
    cookie = data.get('cookie') or request.headers.get('Cookie')

    if not (username or password or cookie):
        return jsonify({'error': 'JPDB authentication required'}), 401

    try:
        service = VocabularyService(JpdbModuleProvider())
        decks = service.get_user_decks(username=username, password=password, cookie_string=cookie)

        if decks is None:
            return jsonify({'error': 'Failed to fetch decks from JPDB'}), 400

        return jsonify([d.dict() for d in decks])

    except Exception as e:
        current_app.logger.error(f"Error fetching user decks: {e}")
        return jsonify({'error': str(e)}), 500


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

    service = VocabularyService(JpdbModuleProvider(), JpdbHttpProvider())
    config = {
        'MAX_BYTES_PER_API_BATCH': current_app.config['MAX_BYTES_PER_API_BATCH'],
        'MAX_SEGMENTS_PER_API_BATCH': current_app.config['MAX_SEGMENTS_PER_API_BATCH'],
        'JPDB_TOKEN_FIELDS': current_app.config['JPDB_TOKEN_FIELDS'],
        'JPDB_VOCAB_FIELDS': current_app.config['JPDB_VOCAB_FIELDS'],
        'JPDB_API_URL': current_app.config['JPDB_API_URL'],
    }
    try:
        tokens = service.get_jpdb_data(request=req, config=config)
        return jsonify([t.dict() for t in tokens])
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

    service = VocabularyService(JpdbModuleProvider(), JpdbHttpProvider())
    _ = service.mine_word(request=req)
    return jsonify({"success": True})


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

    service = VocabularyService(JpdbModuleProvider(), JpdbHttpProvider())
    _ = service.update_word_state(request=req)
    # Preserve legacy predicted state behavior
    new_state = ['known'] if bool(req.state) else ['new']
    return jsonify({"success": True, "newState": new_state})


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

    service = VocabularyService(JpdbModuleProvider(), JpdbHttpProvider())
    review_url = current_app.config.get('JPDB_REVIEW_URL', 'https://jpdb.io/api/v1/review')
    try:
        _ = service.review_card(request=req, review_url=review_url)
    except Exception as e:
        current_app.logger.error(f"JPDB request failed: {e}", exc_info=True)
        return jsonify({'error': 'Failed to contact JPDB'}), 500

    # Predict new card state locally for UI update (legacy behavior)
    rating = req.rating
    if rating in ('good', 'easy', 'pass', 'known'):
        new_state = ['known']
    elif rating in ('nothing', 'hard', 'fail'):
        new_state = ['failed']
    else:
        new_state = ['learning']

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
    service = VocabularyService(JpdbModuleProvider())
    
    try:
        vocab = service.add_vocabulary_word(request=req, user_id=user_id)
        response = AddVocabularyWordResponse(
            success=True,
            id=vocab.id,
            word=vocab.word,
            translation=vocab.translation,
            language=vocab.language,
        )
        return jsonify(response.dict()), 201
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
    
    service = VocabularyService(JpdbModuleProvider())
    
    try:
        vocabulary = service.get_user_vocabulary(
            user_id=user_id,
            language=language,
            mastered=mastered,
            book_id=book_id,
        )
        return jsonify([v.dict() for v in vocabulary])
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
    service = VocabularyService(JpdbModuleProvider())
    
    try:
        vocab = service.toggle_mastered(user_id=user_id, word_id=word_id, mastered=req.mastered)
        if not vocab:
            return jsonify({'error': 'Vocabulary word not found or access denied'}), 404
        return jsonify(vocab.dict())
    except Exception as e:
        current_app.logger.error(f"Error toggling mastered status: {e}", exc_info=True)
        return jsonify({'error': 'Failed to update vocabulary word'}), 500


@vocabulary_bp.route('/due_cards/google-oauth', methods=['POST'])
@require_auth
def fetch_due_cards_google_oauth():
    """Fetch JPDB due cards using Google OAuth token from Clerk (experimental - not yet supported by JPDB)."""
    try:
        user_id = get_user_id()
        if not user_id:
            return jsonify({'error': 'Authentication required'}), 401

        # Get request data
        data = request.get_json() or {}
        try:
            req = FetchDueCardsGoogleOAuthRequest(**data)
        except ValidationError as e:
            return jsonify({'error': f'Invalid request: {str(e)}'}), 400

        # Get Google OAuth token from Clerk
        google_token = drive_provider.get_access_token(user_id)
        if not google_token:
            return jsonify({'error': 'No Google OAuth token found'}), 401

        # NOTE: Direct Google OAuth token usage with JPDB won't work because:
        # 1. JPDB's Google OAuth is separate from our app's Google OAuth
        # 2. OAuth tokens are domain-specific and can't be shared between services
        # 3. JPDB would need to accept our app's Google OAuth tokens (which it doesn't)
        #
        # This is a placeholder that will always fail, but we keep it for future
        # implementation if JPDB ever provides an API that accepts third-party OAuth tokens

        logger.info("Attempting Google OAuth with JPDB (experimental)")
        raise ValueError("Google OAuth with JPDB not yet supported - JPDB doesn't accept third-party OAuth tokens")

    except ValueError as e:
        logger.error(f"Google OAuth authentication with JPDB failed (expected): {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error fetching due cards with Google OAuth: {e}", exc_info=True)
        return jsonify({'error': 'Internal server error'}), 500

