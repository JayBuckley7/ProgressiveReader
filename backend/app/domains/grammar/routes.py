"""Grammar domain routes (LLM validation for example mining)."""
from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError
from typing import Optional

from ...utils.clerk_auth import optional_auth
from ...utils.openai_key_pool import get_openai_key_pool
from .schemas import ValidateExamplesRequest
from .integrations import OpenAIProvider
from .service import GrammarService

grammar_bp = Blueprint("grammar", __name__, url_prefix="/api/grammar")

MAX_CANDIDATES = 30
MAX_SENTENCE_CHARS = 300


def _get_api_key(user_api_key: Optional[str], use_server_key: bool = True) -> Optional[str]:
    """Get API key from user key or server pool."""
    if user_api_key:
        return user_api_key
    if use_server_key:
        pool = get_openai_key_pool()
        key = pool.get_next_key()
        if key:
            return key
        return current_app.config.get("OPENAI_API_KEY")
    return None


@grammar_bp.route("/validate-examples", methods=["POST"])
@optional_auth
def validate_examples():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        # Accept snake_case variants too (some callers may send these).
        if "apiKey" not in data and "api_key" in data:
            data["apiKey"] = data.get("api_key")
        if "maxResults" not in data and "max_results" in data:
            data["maxResults"] = data.get("max_results")

        req = ValidateExamplesRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    if not req.candidates:
        return jsonify({"matches": []}), 200

    if len(req.candidates) > MAX_CANDIDATES:
        return jsonify({"error": f"Too many candidates (max {MAX_CANDIDATES})"}), 400

    for c in req.candidates:
        if not c.sentence or len(c.sentence) > MAX_SENTENCE_CHARS:
            return jsonify({"error": f"Candidate sentence too long (max {MAX_SENTENCE_CHARS} chars)"}), 400
        if c.before and len(c.before) > MAX_SENTENCE_CHARS:
            return jsonify({"error": f"Candidate before too long (max {MAX_SENTENCE_CHARS} chars)"}), 400
        if c.after and len(c.after) > MAX_SENTENCE_CHARS:
            return jsonify({"error": f"Candidate after too long (max {MAX_SENTENCE_CHARS} chars)"}), 400

    api_key_to_use = _get_api_key(req.apiKey, use_server_key=True)
    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    try:
        provider = OpenAIProvider(api_key=api_key_to_use)
        service = GrammarService(provider)
        resp = service.validate_examples(req)
        return jsonify(resp.model_dump())
    except Exception as e:
        current_app.logger.error(f"Error during grammar validation: {e}", exc_info=True)
        return jsonify({"error": f"Error during grammar validation: {e}"}), 500

