"""Admin domain routes for OpenAI key management and admin operations."""
from flask import Blueprint, request, jsonify, current_app
from pydantic import ValidationError
from flask import g

from ...utils.clerk_auth import require_auth, require_admin, is_progressive_reader_admin
from .schemas import (
    AddOpenAIKeyRequest,
    RemoveOpenAIKeyRequest,
)
import logging

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__, url_prefix='/api')


@admin_bp.route('/debug/admin_check', methods=['GET'])
@require_auth
def debug_admin_check():
    """Debug endpoint to check admin status and organization memberships."""
    user = g.user
    if not user:
        return jsonify({"error": "No user found"}), 401

    service = current_app.extensions["container"].admin_service
    result = service.get_admin_status(
        user_id=user.id,
        is_admin_func=is_progressive_reader_admin,
    )
    return jsonify(result.model_dump())


@admin_bp.route('/openai_key_configured', methods=['GET'])
def openai_key_configured():
    """Return whether the server has at least one OpenAI API key."""
    service = current_app.extensions["container"].admin_service
    result = service.get_openai_key_status()
    return jsonify(result.model_dump())


@admin_bp.route('/openai_keys/add', methods=['POST'])
@require_admin
def add_openai_key():
    """Add an API key to the rotation pool."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON payload'}), 400
        req = AddOpenAIKeyRequest(**data)
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid JSON payload: {str(e)}'}), 400
    
    service = current_app.extensions["container"].admin_service
    result = service.add_openai_key(req)
    current_app.logger.info(f'Added OpenAI key. Pool size now {result.pool_size}')
    return jsonify(result.model_dump())


@admin_bp.route('/openai_keys/remove', methods=['POST'])
@require_admin
def remove_openai_key():
    """Remove an API key from the rotation pool."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON payload'}), 400
        req = RemoveOpenAIKeyRequest(**data)
    except ValidationError as e:
        return jsonify({'error': f'Invalid request: {str(e)}'}), 400
    except Exception as e:
        return jsonify({'error': f'Invalid JSON payload: {str(e)}'}), 400
    
    try:
        service = current_app.extensions["container"].admin_service
        result = service.remove_openai_key(req)
        current_app.logger.info(f'Removed OpenAI key. Pool size now {result.pool_size}')
        return jsonify(result.model_dump())
    except ValueError as e:
        return jsonify({'error': str(e)}), 404


@admin_bp.route('/openai_keys', methods=['GET'])
@require_admin
def list_openai_keys():
    """Return the list of stored OpenAI API keys."""
    service = current_app.extensions["container"].admin_service
    result = service.list_openai_keys()
    return jsonify(result.model_dump())
