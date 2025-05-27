"""Blueprint for user metadata operations using Firestore."""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from ..firestore_client import db as fs_db

metadata_bp = Blueprint("metadata", __name__, url_prefix="/metadata")


@metadata_bp.route('/books')
@login_required
def list_books():
    """Return the authenticated user's book list from Firestore."""
    doc = fs_db.collection('users').document(str(current_user.id)).get()
    books = []
    if doc.exists:
        books = doc.to_dict().get('books', [])
    return jsonify(books)


@metadata_bp.route('/position', methods=['GET', 'POST'])
@login_required
def read_position():
    """Get or update the user's reading position."""
    doc_ref = fs_db.collection('users').document(str(current_user.id))
    if request.method == 'GET':
        doc = doc_ref.get()
        pos = 0
        if doc.exists:
            pos = doc.to_dict().get('position', 0)
        return jsonify(position=int(pos))

    data = request.get_json() or {}
    if 'position' not in data:
        return jsonify({'error': 'Missing position'}), 400
    doc_ref.set({'position': data['position']}, merge=True)
    return jsonify(success=True)
