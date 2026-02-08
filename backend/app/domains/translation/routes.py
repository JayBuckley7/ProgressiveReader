"""Translation domain routes."""
from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app, Response
from pydantic import ValidationError

from ...utils.clerk_auth import optional_auth
from ...utils.request_normalization import normalize_aliases
from .http import stream_translate_chapter_sse
from .schemas import TranslateRequest, TranslateResponse

translation_bp = Blueprint('translation', __name__, url_prefix='/api/translate')

@translation_bp.route('/chapter', methods=['POST'])
@optional_auth
def translate_chapter():
    """Translate chapter HTML content with OpenAI, optimized for long-form content with streaming support."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

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
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

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
        return jsonify({"error": f"Error during chapter translation: {e}"}), 500


@translation_bp.route('/vocabulary', methods=['POST'])
@optional_auth
def translate_vocabulary():
    """Translate individual words or phrases for vocabulary highlighting, optimized for speed and accuracy."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        normalize_aliases(
            data,
            {
                "target_lang": ["target_language", "targetLanguage", "targetLang"],
                "api_key": ["apiKey"],
                "translation_service": ["translationService"],
                "use_server_key": ["useServerKey"],
                "model": ["modelName"],
            },
        )

        # Default for vocabulary
        data.setdefault("target_lang", "English")

        req = TranslateRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    current_app.logger.info(
        f"--- Vocabulary Translation Request --- Content: '{req.content[:50]}...', "
        f"Lang: {req.target_lang}, Service: {req.translation_service}"
    )

    # Get API key
    use_server_key = data.get('use_server_key', True)
    container = current_app.extensions["container"]
    api_key_to_use = container.openai_key_resolver.resolve(req.api_key, use_server_key=bool(use_server_key))
    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    try:
        service = container.make_translation_service(api_key_to_use)
        result = service.translate_vocabulary(req)

        current_app.logger.info(
            f"Vocabulary OpenAI translation successful: '{req.content}' -> '{result.translated_text}'"
        )
        return jsonify(result.model_dump())

    except Exception as e:
        current_app.logger.error(f"Error calling OpenAI API for vocabulary: {e}", exc_info=True)
        return jsonify({"error": f"Error during vocabulary translation: {e}"}), 500
