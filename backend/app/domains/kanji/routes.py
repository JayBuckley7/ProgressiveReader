"""Kanji domain routes."""
from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError

from ...utils.clerk_auth import require_admin
from .schemas import KanjiSearchRequest, UpdateKanjiJlptRequest

kanji_bp = Blueprint('kanji', __name__, url_prefix='/api/kanji')


@kanji_bp.route('/search', methods=['POST'])
@require_admin
def search_kanji():
    """Search for kanji by character or meaning."""
    try:
        data = request.get_json() or {}
        req = KanjiSearchRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    try:
        container = current_app.extensions["container"]
        service = container.make_kanji_service()
        result = service.search_kanji(req)
        return jsonify(result.model_dump())
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        current_app.logger.error(f"Error searching kanji: {e}", exc_info=True)
        return jsonify({"error": "Failed to search kanji"}), 500


@kanji_bp.route('/update', methods=['POST'])
@require_admin
def update_kanji_jlpt():
    """Update the JLPT level of a kanji."""
    try:
        data = request.get_json() or {}
        req = UpdateKanjiJlptRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    try:
        container = current_app.extensions["container"]
        service = container.make_kanji_service()
        result = service.update_jlpt_level(req)
        current_app.logger.info(
            f'Updated kanji {req.kanji} JLPT level from {result.old_jlpt} to {result.new_jlpt}'
        )
        return jsonify(result.model_dump())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        current_app.logger.error(f"Error updating kanji: {e}", exc_info=True)
        return jsonify({"error": "Failed to update kanji"}), 500


#
# NOTE: `/api/kanji/info/<kanji_char>` was removed (unused by the frontend).
#
