"""Blueprint for storing and retrieving book metadata via Firestore."""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from google.cloud import firestore

from ..firestore_client import db as fs_db

metadata_bp = Blueprint("metadata", __name__, url_prefix="/metadata")


@metadata_bp.route("/books", methods=["GET"])
@login_required
def get_all_books():
    """Return all stored books for the current user."""
    doc = fs_db.collection("users").document(str(current_user.id)).get()
    books = doc.to_dict().get("books", []) if doc.exists else []
    return jsonify(books)


@metadata_bp.route("/books", methods=["POST"])
@login_required
def add_book():
    """Add a book entry for the current user."""
    data = request.get_json() or {}
    if "id" not in data:
        return jsonify({"error": "Missing id"}), 400
    user_doc = fs_db.collection("users").document(str(current_user.id))
    user_doc.set({"books": firestore.ArrayUnion([data])}, merge=True)
    return jsonify(success=True)


@metadata_bp.route("/position", methods=["GET", "POST"])
@login_required
def read_position():
    """Get or update the user's reading position."""
    doc_ref = fs_db.collection("users").document(str(current_user.id))
    if request.method == "GET":
        snap = doc_ref.get()
        pos = 0
        if snap.exists:
            pos = snap.to_dict().get("position", 0)
        return jsonify(position=pos)

    data = request.get_json() or {}
    if "position" not in data:
        return jsonify({"error": "Missing position"}), 400
    doc_ref.set({"position": data["position"]}, merge=True)
    return jsonify(success=True)

