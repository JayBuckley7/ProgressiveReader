"""Vocabulary domain routes."""
from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError

from ...utils.clerk_auth import require_auth, optional_auth, get_user_id
from ...domains.drive.integrations import ClerkDriveProvider
from .service import VocabularyService
from .integrations import JpdbModuleProvider, JpdbHttpProvider
from .schemas import (
    GetJpdbDataRequest,
    Deck,
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
import time
from typing import Any, Dict, List, Tuple, Optional

import requests

logger = logging.getLogger(__name__)

vocabulary_bp = Blueprint('vocabulary', __name__, url_prefix='/api')

# Initialize drive provider for Google OAuth token access
drive_provider = ClerkDriveProvider(secret_key=os.getenv('CLERK_SECRET_KEY'))

JPDB_API_BASE_URL = "https://jpdb.io/api/v1"


def _get_jpdb_api_key_from_request(data: Optional[dict] = None) -> str | None:
    """
    Get JPDB API key from request cookies/body.

    We intentionally do NOT use Authorization header because it's already used
    for Clerk session auth in this app.
    """
    key = (
        (request.cookies.get("jpdbApiKey") or "").strip()
        or (request.cookies.get("jpdb_api_key") or "").strip()
        or (request.cookies.get("jpdb_api_key".upper()) or "").strip()
    )
    if key:
        return key

    body = data or {}
    for k in ("jpdbApiKey", "jpdb_api_key", "jpdb_api_key".upper()):
        v = body.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _jpdb_api_post(endpoint: str, *, jpdb_api_key: str, payload: dict, timeout: Tuple[float, float] = (5.0, 30.0)) -> Dict[str, Any]:
    url = f"{JPDB_API_BASE_URL}/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {jpdb_api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "ProgressiveReader/jpdb-proxy",
    }

    response = requests.post(url, headers=headers, json=payload, timeout=timeout)
    if response.status_code != 200:
        try:
            error_payload = response.json()
            message = (
                error_payload.get("error_message")
                or error_payload.get("error")
                or str(error_payload)
            )
        except Exception:
            message = response.text
        raise ValueError(message or f"JPDB API error ({response.status_code})")

    payload = response.json() or {}
    if isinstance(payload, dict) and payload.get("error"):
        raise ValueError(payload.get("error_message") or payload.get("error") or "JPDB API error")

    return payload


def _jpdb_api_post_with_retries(endpoint: str, *, jpdb_api_key: str, payload: dict, retries: int = 3) -> Dict[str, Any]:
    delay = 0.25
    for attempt in range(retries):
        try:
            return _jpdb_api_post(endpoint, jpdb_api_key=jpdb_api_key, payload=payload)
        except Exception as exc:
            if attempt >= retries - 1:
                raise
            time.sleep(delay)
            delay *= 2
            current_app.logger.debug("Retrying JPDB call %s after error: %s", endpoint, exc)


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
    cookie = data.get('cookie') or request.headers.get('X-JPDB-Cookie')

    if not (username or password or cookie):
        jpdb_api_key = _get_jpdb_api_key_from_request(data)
        if not jpdb_api_key:
            return jsonify({'error': 'JPDB API key not configured'}), 401

        try:
            jpdb_payload = _jpdb_api_post_with_retries(
                "list-user-decks",
                jpdb_api_key=jpdb_api_key,
                payload={"fields": ["id", "name", "word_count"]},
            )
            raw_decks = jpdb_payload.get("decks") or []
            decks = []
            for row in raw_decks:
                deck_id = None
                name = None
                words = None

                if isinstance(row, dict):
                    deck_id = row.get("id") or row.get("deck_id")
                    name = row.get("name") or row.get("title")
                    words = row.get("word_count") or row.get("words") or row.get("count")
                elif isinstance(row, list):
                    if len(row) >= 2:
                        deck_id = row[0]
                        name = row[1]
                        words = row[2] if len(row) > 2 else None

                if deck_id is None or name is None:
                    continue

                decks.append(Deck(id=str(deck_id), name=str(name), words=int(words) if isinstance(words, int) else words))
            return jsonify([d.dict() for d in decks])
        except Exception as e:
            current_app.logger.error(f"Error fetching user decks via JPDB API: {e}", exc_info=True)
            return jsonify({'error': 'Failed to fetch decks from JPDB'}), 500

    try:
        service = VocabularyService(JpdbModuleProvider())
        decks = service.get_user_decks(username=username, password=password, cookie_string=cookie)

        if decks is None:
            return jsonify({'error': 'Failed to fetch decks from JPDB'}), 400

        return jsonify([d.dict() for d in decks])

    except Exception as e:
        current_app.logger.error(f"Error fetching user decks: {e}")
        return jsonify({'error': str(e)}), 500


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

    jpdb_api_key = _get_jpdb_api_key_from_request(data)
    if not jpdb_api_key:
        return jsonify({"error": "JPDB API key not configured"}), 401

    try:
        result = _jpdb_api_post_with_retries(
            "deck/list-vocabulary",
            jpdb_api_key=jpdb_api_key,
            payload={"id": deck_id},
        )
        vocab = result.get("vocabulary")
        if not isinstance(vocab, list):
            return jsonify({"error": "Unexpected JPDB response"}), 502
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

    if not isinstance(pairs, list) or not pairs:
        return jsonify({"error": "Missing list"}), 400
    if not isinstance(fields, list) or not fields:
        return jsonify({"error": "Missing fields"}), 400

    jpdb_api_key = _get_jpdb_api_key_from_request(data)
    if not jpdb_api_key:
        return jsonify({"error": "JPDB API key not configured"}), 401

    try:
        chunk_size = data.get("chunkSize")
        chunk_size_int = int(chunk_size) if chunk_size is not None else 300
    except Exception:
        chunk_size_int = 300
    chunk_size_int = max(50, min(600, chunk_size_int))

    try:
        combined: List[Any] = []
        for i in range(0, len(pairs), chunk_size_int):
            chunk = pairs[i:i + chunk_size_int]
            result = _jpdb_api_post_with_retries(
                "lookup-vocabulary",
                jpdb_api_key=jpdb_api_key,
                payload={"list": chunk, "fields": fields},
            )
            info = result.get("vocabulary_info") or []
            if not isinstance(info, list):
                return jsonify({"error": "Unexpected JPDB response"}), 502
            combined.extend(info)
            if i + chunk_size_int < len(pairs):
                time.sleep(0.25)
        return jsonify({"vocabulary_info": combined})
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
