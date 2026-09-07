"""Lyrics import routes."""

from flask import Blueprint, current_app, jsonify, request
from pydantic import ValidationError

from .schemas import ImportLyricsRequest


lyrics_bp = Blueprint("lyrics", __name__, url_prefix="/api/lyrics")


@lyrics_bp.route("/import", methods=["POST"])
def import_lyrics():
    try:
        payload = ImportLyricsRequest(**(request.get_json() or {}))
        result = current_app.extensions["container"].lyrics_service.import_kanji_lyrics(payload.url)
        return jsonify(result.model_dump())
    except (ValidationError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502
    except Exception:
        current_app.logger.exception("Lyrics import failed")
        return jsonify({"error": "Failed to import lyrics"}), 500


__all__ = ["lyrics_bp"]
