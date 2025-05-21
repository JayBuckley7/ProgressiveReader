"""Blueprint for storing and retrieving book metadata via Redis."""

import json
from flask import Blueprint, request, jsonify, current_app
import redis

metadata_bp = Blueprint("metadata", __name__, url_prefix="/metadata")


@metadata_bp.route("/<user_id>/books", methods=["GET"])
def get_all_books(user_id):
    """Return all stored metadata for a user."""
    r = redis.Redis.from_url(current_app.config["REDIS_URL"])
    raw = r.get(f"user:{user_id}:books")
    books = json.loads(raw) if raw else []
    return jsonify(books)


@metadata_bp.route("/<user_id>/book/<book_id>", methods=["POST"])
def store_book(user_id, book_id):
    """Store metadata for a specific book including coverDriveId."""
    data = request.get_json()
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON payload"}), 400
    r = redis.Redis.from_url(current_app.config["REDIS_URL"])
    key_list = f"user:{user_id}:books"
    key_book = f"user:{user_id}:book:{book_id}"
    raw = r.get(key_list)
    books = json.loads(raw) if raw else []
    updated = False
    for idx, item in enumerate(books):
        if item.get("id") == book_id:
            books[idx] = data
            updated = True
            break
    if not updated:
        books.append(data)
    r.set(key_list, json.dumps(books))
    r.set(key_book, json.dumps(data))
    return jsonify({"success": True})
