"""Deployment-managed credential status. Runtime mutations are intentionally disabled."""
from flask import Blueprint, jsonify, current_app
from ...utils.clerk_auth import require_admin

admin_bp = Blueprint('admin', __name__, url_prefix='/api')

@admin_bp.route('/openai-key-configured')
def openai_key_configured():
    # A configured secret does not mean server-funded execution is enabled.
    return jsonify(openai_key_configured=False, pool_size=0, server_funded_enabled=False)

@admin_bp.route('/openai-keys')
@require_admin
def list_openai_keys():
    result = current_app.extensions['container'].admin_service.list_openai_keys()
    return jsonify(**result.model_dump(), deployment_managed=True, server_funded_enabled=False)

@admin_bp.route('/openai-keys/add', methods=['POST'])
@admin_bp.route('/openai-keys/remove', methods=['POST'])
@require_admin
def immutable_keys():
    return jsonify(code='DEPLOYMENT_MANAGED', error='API credentials are managed through deployment secrets. Server-funded AI is disabled.'), 409
