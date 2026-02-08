"""Mix mode routes (LLM-assisted ambiguous swap refinement)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request, current_app
from pydantic import ValidationError

from ...utils.clerk_auth import optional_auth
from .controller import MixController

mix_bp = Blueprint("mix", __name__, url_prefix="/api/mix")


@mix_bp.route("/refine", methods=["POST"])
@optional_auth
def refine_swaps():
    try:
        data = request.get_json() or {}
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    container = current_app.extensions["container"]

    try:
        controller = MixController(
            openai_key_resolver=container.openai_key_resolver,
            make_mix_service=container.make_mix_service,
        )
        result = controller.refine_swaps(data)
        return jsonify(result.model_dump())
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        current_app.logger.error("[mix.refine] error: %s", e, exc_info=True)
        return jsonify({"error": f"Error during refine: {e}"}), 500


__all__ = ["mix_bp"]
