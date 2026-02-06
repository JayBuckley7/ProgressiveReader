"""Grammar domain routes (LLM validation for example mining)."""
from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError
from typing import Optional
from openai import OpenAI

from ...utils.clerk_auth import optional_auth
from ...utils.openai_key_pool import get_openai_key_pool
from .schemas import ValidateExamplesRequest, TeachExamplesRequest
from .integrations import OpenAIProvider
from .service import GrammarService

grammar_bp = Blueprint("grammar", __name__, url_prefix="/api/grammar")

MAX_CANDIDATES = 30
MAX_SENTENCE_CHARS = 300
MAX_TEACH_EXAMPLES = 3


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


@grammar_bp.route("/teach-examples", methods=["POST"])
@optional_auth
def teach_examples():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        if "apiKey" not in data and "api_key" in data:
            data["apiKey"] = data.get("api_key")

        req = TeachExamplesRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    if not req.examples:
        return jsonify({"teachings": []}), 200

    if len(req.examples) > MAX_TEACH_EXAMPLES:
        return jsonify({"error": f"Too many examples (max {MAX_TEACH_EXAMPLES})"}), 400

    for ex in req.examples:
        if not ex.sentence or len(ex.sentence) > MAX_SENTENCE_CHARS:
            return jsonify({"error": f"Example sentence too long (max {MAX_SENTENCE_CHARS} chars)"}), 400

    api_key_to_use = _get_api_key(req.apiKey, use_server_key=True)
    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    # Build a small JSON-only prompt.
    import json as _json

    payload = {
        "grammar": req.grammar.model_dump(),
        "examples": [
            {
                "exampleId": e.exampleId,
                "sentence": e.sentence,
                "before": e.before,
                "after": e.after,
                "matchSpan": e.matchSpan.model_dump() if e.matchSpan else None,
            }
            for e in req.examples
        ],
        "task": (
            "For each example, produce:\n"
            "- translation: a natural English translation (1 sentence)\n"
            "- breakdown: a short segment gloss line like 'X (meaning) Y (meaning)'\n"
            "- usageNote: a short note explaining how the grammar is functioning in THIS sentence (1 sentence)\n"
            "- contrast: rewrite the sentence swapping the grammar for a close alternative when reasonable "
            "(e.g. だから vs ので/ですから), plus a short note about tone/nuance.\n"
            "Keep everything concise."
        ),
        "output_shape": {
            "teachings": [
                {
                    "exampleId": "string",
                    "translation": "string",
                    "breakdown": "string",
                    "usageNote": "string",
                    "contrast": {"alternative": "string", "note": "string"},
                }
            ]
        },
    }

    system_prompt = (
        "You are a Japanese teacher. You must output ONLY valid JSON.\n"
        "Do not include markdown. Keep notes short and accurate.\n"
        "If a contrast rewrite is unnatural, set contrast to null.\n"
    )

    try:
        client = OpenAI(api_key=api_key_to_use)
        completion = client.chat.completions.create(
            model=req.model or "gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": _json.dumps(payload, ensure_ascii=False)},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        content = completion.choices[0].message.content or "{}"
        data_out = _json.loads(content)
    except Exception as e:
        current_app.logger.error(f"Error during grammar teaching generation: {e}", exc_info=True)
        return jsonify({"error": f"Error during grammar teaching generation: {e}"}), 500

    teachings = data_out.get("teachings") if isinstance(data_out, dict) else None
    if not isinstance(teachings, list):
        return jsonify({"teachings": []}), 200

    # Filter/normalize output.
    normalized = []
    for row in teachings:
        if not isinstance(row, dict):
            continue
        example_id = row.get("exampleId")
        if not isinstance(example_id, str) or not example_id:
            continue
        translation = row.get("translation")
        breakdown = row.get("breakdown")
        usage_note = row.get("usageNote")
        contrast = row.get("contrast")
        if not isinstance(translation, str):
            translation = None
        if not isinstance(breakdown, str):
            breakdown = None
        if not isinstance(usage_note, str):
            usage_note = None
        if not isinstance(contrast, dict):
            contrast = None
        else:
            alt = contrast.get("alternative")
            note = contrast.get("note")
            if not isinstance(alt, str) or not isinstance(note, str):
                contrast = None
            else:
                contrast = {"alternative": alt, "note": note}

        normalized.append(
            {
                "exampleId": example_id,
                "translation": translation,
                "breakdown": breakdown,
                "usageNote": usage_note,
                "contrast": contrast,
            }
        )

    return jsonify({"teachings": normalized})
