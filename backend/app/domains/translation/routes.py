"""Translation domain routes."""
from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app, Response
from pydantic import ValidationError

from ...utils.clerk_auth import optional_auth
from ...utils.request_normalization import normalize_aliases
from .http import stream_translate_chapter_sse
from .schemas import TranslateRequest, TranslateResponse

translation_bp = Blueprint('translation', __name__, url_prefix='/api/translate')

def _get_json_dict() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError("Invalid JSON payload")
    return data

@translation_bp.route('/chapter', methods=['POST'])
@optional_auth
def translate_chapter():
    """Translate chapter HTML content with OpenAI, optimized for long-form content with streaming support."""
    try:
        data = _get_json_dict()

        normalize_aliases(
            data,
            {
                "target_lang": ["target_language", "targetLanguage", "targetLang"],
                "source_lang": ["source_language", "sourceLanguage", "sourceLang"],
                # Some clients send camelCase for flags/settings.
                "api_key": ["apiKey"],
                "use_cefr": ["useCefr"],
                "cefr_level": ["cefrLevel"],
                "translation_service": ["translationService"],
            },
        )

        req = TranslateRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "Invalid JSON payload"}), 400

    container = current_app.extensions["container"]
    # Get API key (user key if provided, otherwise server pool/config).
    api_key_to_use = container.openai_key_resolver.resolve(req.api_key, use_server_key=True)
    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    current_app.logger.info(
        f"--- Chapter Translation Request --- Lang: {req.target_lang}, Model: {req.model}, "
        f"Service: {req.translation_service}, CEFR: {req.cefr_level or 'N/A'}, Stream: {req.stream}"
    )

    try:
        service = container.make_translation_service(api_key_to_use)

        if req.stream:
            # Explicit content_type to avoid Flask adding charset for this stream.
            return Response(stream_translate_chapter_sse(service=service, req=req), content_type="text/event-stream")
        else:
            result = service.translate_chapter(req)
            current_app.logger.info(
                f"Chapter translation successful. First 100 chars: {result.translated_text[:100]}..."
            )
            return jsonify(result.model_dump())

    except Exception as e:
        current_app.logger.error(f"Error calling OpenAI API for chapter: {e}", exc_info=True)
        return jsonify({"error": "Error during chapter translation"}), 500


#
# NOTE: `/api/translate/vocabulary` was intentionally removed.
# Vocabulary translation is either:
# - handled via JPDB vocabulary endpoints, or
# - handled client-side using a user-provided OpenAI key (privacy promise).
#
