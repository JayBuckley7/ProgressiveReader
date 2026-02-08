"""Grammar domain routes (LLM validation for example mining)."""
from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError

from ...utils.clerk_auth import optional_auth
from ...utils.request_normalization import normalize_aliases
from .schemas import ValidateExamplesRequest, TeachExamplesRequest

grammar_bp = Blueprint("grammar", __name__, url_prefix="/api/grammar")

@grammar_bp.route("/validate-examples", methods=["POST"])
@optional_auth
def validate_examples():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        normalize_aliases(
            data,
            {
                "apiKey": ["api_key"],
                "maxResults": ["max_results"],
            },
        )

        req = ValidateExamplesRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    if not req.candidates:
        return jsonify({"matches": []}), 200

    container = current_app.extensions["container"]
    api_key_to_use = container.openai_key_resolver.resolve(req.apiKey, use_server_key=True)
    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    try:
        service = container.make_grammar_service(api_key_to_use)
        resp = service.validate_examples(req)
        return jsonify(resp.model_dump())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error during grammar validation: {e}", exc_info=True)
        return jsonify({"error": f"Error during grammar validation: {e}"}), 500


@grammar_bp.route("/teach-examples", methods=["POST"])
@optional_auth
def teach_examples():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        normalize_aliases(data, {"apiKey": ["api_key"]})

        req = TeachExamplesRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    if not req.examples:
        return jsonify({"teachings": []}), 200

    container = current_app.extensions["container"]
    api_key_to_use = container.openai_key_resolver.resolve(req.apiKey, use_server_key=True)
    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    try:
        service = container.make_grammar_service(api_key_to_use)
        resp = service.teach_examples(req)
        return jsonify(resp.model_dump())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error during grammar teaching generation: {e}", exc_info=True)
        return jsonify({"error": f"Error during grammar teaching generation: {e}"}), 500
