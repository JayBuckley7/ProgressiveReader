"""Blueprint for storing user settings via Clerk metadata."""

from flask import Blueprint, request, jsonify
from ..utils.clerk_auth import require_auth, get_user_id
from clerk_backend_api import Clerk
import os

settings_bp = Blueprint("settings", __name__, url_prefix="/settings")

clerk_secret_key = os.getenv("CLERK_SECRET_KEY")
clerk_client = Clerk(bearer_auth=clerk_secret_key) if clerk_secret_key else None


@settings_bp.route("", methods=["GET"])
@require_auth
def get_settings():
    """Return the current user's settings stored in Clerk metadata."""
    if not clerk_client:
        return jsonify({"error": "Clerk client not configured"}), 500

    user_id = get_user_id()
    user = clerk_client.users.get(user_id=user_id)
    settings = {}
    if user and getattr(user, "private_metadata", None):
        settings = user.private_metadata.get("settings", {}) or {}
    return jsonify(settings)


@settings_bp.route("", methods=["POST"])
@require_auth
def save_settings():
    """Save the JSON payload as the user's settings in Clerk metadata."""
    if not clerk_client:
        return jsonify({"error": "Clerk client not configured"}), 500

    data = request.get_json() or {}
    user_id = get_user_id()
    user = clerk_client.users.get(user_id=user_id)
    current_settings = {}
    if user and getattr(user, "private_metadata", None):
        current_settings = user.private_metadata.get("settings", {}) or {}
    if isinstance(current_settings, dict):
        current_settings.update(data)
    else:
        current_settings = data

    clerk_client.users.update_metadata(
        user_id=user_id,
        private_metadata={"settings": current_settings},
    )
    return jsonify(success=True)
