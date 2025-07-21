"""Blueprint for storing and retrieving book metadata via Firestore."""

from flask import Blueprint, request, jsonify
from ..utils.clerk_auth import require_auth, get_user_id
from google.cloud import firestore

# Initialize Firestore client
fs_db = firestore.Client()

metadata_bp = Blueprint("metadata", __name__, url_prefix="/metadata")


@metadata_bp.route("/books", methods=["GET"])
@require_auth
def get_all_books():
    """Return all stored books for the current user."""
    user_id = get_user_id()
    doc = fs_db.collection("users").document(str(user_id)).get()
    books = doc.to_dict().get("books", []) if doc.exists else []
    return jsonify(books)


@metadata_bp.route("/books", methods=["POST"])
@require_auth
def add_book():
    """Add a book entry for the current user."""
    data = request.get_json() or {}
    if "id" not in data:
        return jsonify({"error": "Missing id"}), 400
    user_id = get_user_id()
    user_doc = fs_db.collection("users").document(str(user_id))
    user_doc.set({"books": firestore.ArrayUnion([data])}, merge=True)
    return jsonify(success=True)


@metadata_bp.route("/position", methods=["GET", "POST"])
@require_auth
def read_position():
    """Get or update the user's reading position."""
    user_id = get_user_id()
    doc_ref = fs_db.collection("users").document(str(user_id))
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

