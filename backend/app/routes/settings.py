"""Blueprint for storing user settings in Clerk private_metadata."""

from flask import Blueprint, request, jsonify
from ..utils.clerk_auth import require_auth, get_user_id
from clerk_backend_api import Clerk
import os

settings_bp = Blueprint("settings", __name__, url_prefix="/settings")

clerk_secret_key = os.getenv("CLERK_SECRET_KEY")
clerk_client = Clerk(bearer_auth=clerk_secret_key) if clerk_secret_key else None


def _load_user():
    """Fetch the current Clerk user object (or None)."""
    if not clerk_client:
        return None, None
    user_id = get_user_id()
    try:
        return user_id, clerk_client.users.get(user_id=user_id)
    except Exception:
        return user_id, None


@settings_bp.route("", methods=["GET"])
@require_auth
def get_settings():
    """Return the caller’s settings (empty object if none stored)."""
    user_id, user = _load_user()
    if not user:
        return jsonify({"error": "Clerk client not configured or user not found"}), 500

    settings = (user.private_metadata or {}).get("settings", {}) or {}
    return jsonify(settings)


@settings_bp.route("", methods=["POST"])
@require_auth
def save_settings():
    """Merge the JSON payload into the user’s settings without clobbering other metadata."""
    data = request.get_json() or {}

    user_id, user = _load_user()
    if not user:
        return jsonify({"error": "Clerk client not configured or user not found"}), 500

    # Preserve all existing private_metadata keys.
    private_meta = dict(user.private_metadata or {})
    current = private_meta.get("settings", {}) or {}
    if isinstance(current, dict):
        current.update(data)
    else:
        current = data

    private_meta["settings"] = current

    clerk_client.users.update_metadata(
        user_id=user_id,
        private_metadata=private_meta,
    )
    return jsonify(success=True)
