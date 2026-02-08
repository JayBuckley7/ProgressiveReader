"""Mix mode routes (LLM-assisted ambiguous swap refinement)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request, current_app
from pydantic import ValidationError

from ...utils.clerk_auth import optional_auth
from ...utils.request_normalization import normalize_aliases
from .schemas import MixRefineRequest

mix_bp = Blueprint("mix", __name__, url_prefix="/api/mix")


@mix_bp.route("/refine", methods=["POST"])
@optional_auth
def refine_swaps():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        normalize_aliases(
            data,
            {
                "text_sample": ["textSample"],
                "ambiguous_keys": ["ambiguousKeys"],
                "candidates_by_key": ["candidatesByKey"],
                "api_key": ["apiKey"],
                "model": ["modelName"],
            },
        )

        req = MixRefineRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    container = current_app.extensions["container"]
    api_key_to_use = container.openai_key_resolver.resolve(req.api_key, use_server_key=True)
    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    try:
        service = container.make_mix_service(api_key_to_use)
        result = service.refine_swaps(req)
        return jsonify(result.model_dump())
    except Exception as e:
        current_app.logger.error("[mix.refine] error: %s", e, exc_info=True)
        return jsonify({"error": f"Error during refine: {e}"}), 500


__all__ = ["mix_bp"]
