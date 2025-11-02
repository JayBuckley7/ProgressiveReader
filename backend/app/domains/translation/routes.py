"""Translation domain routes."""
from __future__ import annotations

from flask import Blueprint, request, jsonify, current_app, Response
from pydantic import ValidationError
from typing import Optional
import json

from ...utils.clerk_auth import optional_auth
from ...utils.openai_key_pool import get_openai_key_pool
from .service import TranslationService
from .integrations import OpenAIProvider
from .schemas import TranslateRequest, TranslateResponse

translation_bp = Blueprint('translation', __name__, url_prefix='/api/translate')


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


@translation_bp.route('/chapter', methods=['POST'])
@optional_auth
def translate_chapter():
    """Translate chapter HTML content with OpenAI, optimized for long-form content with streaming support."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        # Normalize field names
        if 'target_lang' not in data:
            for alt in ['target_language', 'targetLanguage']:
                if alt in data:
                    data['target_lang'] = data.pop(alt)
                    break

        if 'source_lang' not in data:
            for alt in ['source_language', 'sourceLanguage']:
                if alt in data:
                    data['source_lang'] = data.pop(alt)
                    break

        req = TranslateRequest(**data)
    except ValidationError as e:
        return jsonify({"error": f"Invalid request: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"error": f"Invalid JSON payload: {str(e)}"}), 400

    # Get API key
    api_key_to_use = _get_api_key(req.api_key, use_server_key=True)
    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    current_app.logger.info(
        f"--- Chapter Translation Request --- Lang: {req.target_lang}, Model: {req.model}, "
        f"Service: {req.translation_service}, CEFR: {req.cefr_level or 'N/A'}, Stream: {req.stream}"
    )

    try:
        provider = OpenAIProvider(api_key=api_key_to_use)
        service = TranslationService(provider)

        if req.stream:
            def generate():
                buffer = ""
                last_chunk = ""

                yield "data: {\"status\": \"started\"}\n\n"
                for part in service.stream_translate_chapter(req):
                    if part:
                        buffer += part
                        last_chunk += part
                        # Clean markdown code fences
                        while "```html" in buffer:
                            buffer = buffer.replace("```html", "", 1)
                        while "```" in buffer:
                            buffer = buffer.replace("```", "", 1)
                        yield f"data: {json.dumps({'content': buffer})}\n\n"
                        buffer = ""

                if buffer:
                    yield f"data: {json.dumps({'content': buffer})}\n\n"

                # Clean final text
                clean_translated_text = last_chunk
                if clean_translated_text.startswith("```html"):
                    clean_translated_text = clean_translated_text[7:].strip()
                elif clean_translated_text.startswith("```"):
                    clean_translated_text = clean_translated_text[3:].strip()
                if clean_translated_text.endswith("```"):
                    clean_translated_text = clean_translated_text[:-3].strip()

                yield (
                    "data: "
                    f"{json.dumps({'complete': True, 'translated_text': clean_translated_text})}"
                    "\n\n"
                )
                yield "data: [DONE]\n\n"

            return Response(generate(), mimetype="text/event-stream")
        else:
            result = service.translate_chapter(req)
            current_app.logger.info(
                f"Chapter translation successful. First 100 chars: {result.translated_text[:100]}..."
            )
            return jsonify(result.dict())

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

        # Normalize field names
        if 'target_lang' not in data:
            for alt in ['target_language', 'targetLanguage']:
                if alt in data:
                    data['target_lang'] = data.pop(alt)
                    break
            if 'target_lang' not in data:
                data['target_lang'] = 'English'  # Default for vocabulary

        # Set vocabulary-optimized defaults
        if 'translation_service' not in data:
            data['translation_service'] = 'openai'
        if 'model' not in data:
            data['model'] = 'gpt-3.5-turbo'

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
    use_server_key = request.get_json().get('use_server_key', True) if request.get_json() else True
    api_key_to_use = _get_api_key(req.api_key, use_server_key=use_server_key)
    if not api_key_to_use:
        return jsonify({"error": "OpenAI API key not configured"}), 400

    try:
        provider = OpenAIProvider(api_key=api_key_to_use)
        service = TranslationService(provider)
        result = service.translate_vocabulary(req)

        current_app.logger.info(
            f"Vocabulary OpenAI translation successful: '{req.content}' -> '{result.translated_text}'"
        )
        return jsonify(result.dict())

    except Exception as e:
        current_app.logger.error(f"Error calling OpenAI API for vocabulary: {e}", exc_info=True)
        return jsonify({"error": f"Error during vocabulary translation: {e}"}), 500

