"""Blueprint for storing user settings in Firestore."""

from flask import Blueprint, request, jsonify
from ..utils.clerk_auth import require_auth, get_user_id

settings_bp = Blueprint("settings", __name__, url_prefix="/settings")


@settings_bp.route("", methods=["GET"])
@require_auth
def get_settings():
    """Return the current user's settings document."""
    doc = fs_db.collection("users").document(str(get_user_id())).get()
    settings = doc.to_dict().get("settings", {}) if doc.exists else {}
    return jsonify(settings)


@settings_bp.route("", methods=["POST"])
@require_auth
def save_settings():
    """Save the JSON payload as the user's settings."""
    data = request.get_json() or {}
    doc_ref = fs_db.collection("users").document(str(get_user_id()))
    snap = doc_ref.get()
    current_settings = {}
    if snap.exists:
        current_settings = snap.to_dict().get("settings", {}) or {}
    if isinstance(current_settings, dict):
        current_settings.update(data)
    else:
        current_settings = data
    doc_ref.set({"settings": current_settings}, merge=True)
    return jsonify(success=True)
