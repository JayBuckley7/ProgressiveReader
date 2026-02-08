"""Grammar domain routes (LLM validation for example mining)."""
from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError

from ...utils.clerk_auth import optional_auth
from .controller import GrammarController

grammar_bp = Blueprint("grammar", __name__, url_prefix="/api/grammar")

@grammar_bp.route("/validate-examples", methods=["POST"])
@optional_auth
def validate_examples():
    try:
        data = request.get_json() or {}
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    try:
        container = current_app.extensions["container"]
        controller = GrammarController(
            openai_key_resolver=container.openai_key_resolver,
            make_grammar_service=container.make_grammar_service,
        )
        resp = controller.validate_examples(data)
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
        data = request.get_json() or {}
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    try:
        container = current_app.extensions["container"]
        controller = GrammarController(
            openai_key_resolver=container.openai_key_resolver,
            make_grammar_service=container.make_grammar_service,
        )
        resp = controller.teach_examples(data)
        return jsonify(resp.model_dump())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Error during grammar teaching generation: {e}", exc_info=True)
        return jsonify({"error": f"Error during grammar teaching generation: {e}"}), 500
