"""Blueprint for storing user settings in Firestore."""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from ..firestore_client import db as fs_db

settings_bp = Blueprint("settings", __name__, url_prefix="/settings")


@settings_bp.route("", methods=["GET"])
@login_required
def get_settings():
    """Return the current user's settings document."""
    doc = fs_db.collection("users").document(str(current_user.id)).get()
    settings = doc.to_dict().get("settings", {}) if doc.exists else {}
    return jsonify(settings)


@settings_bp.route("", methods=["POST"])
@login_required
def save_settings():
    """Save the JSON payload as the user's settings."""
    data = request.get_json() or {}
    doc_ref = fs_db.collection("users").document(str(current_user.id))
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
