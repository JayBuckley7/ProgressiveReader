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
    current_app.logger.info(
        "Fetched %s book metadata entries from Redis for user %s", len(books), user_id
    )
    return jsonify(books)


@metadata_bp.route("/<user_id>/book/<book_id>", methods=["POST"])
def store_book(user_id, book_id):
    """Store metadata for a specific book including coverDriveId."""
    data = request.get_json()
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON payload"}), 400
    r = redis.Redis.from_url(current_app.config["REDIS_URL"])
    current_app.logger.info(
        "Storing Redis metadata for user %s book %s (%s)",
        user_id,
        book_id,
        data.get("title"),
    )
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


@metadata_bp.route("/<user_id>/book/<book_id>", methods=["DELETE"])
def delete_book(user_id, book_id):
    """Delete stored metadata for a specific book."""
    r = redis.Redis.from_url(current_app.config["REDIS_URL"])
    current_app.logger.info(
        "Deleting Redis metadata for user %s book %s", user_id, book_id
    )
    key_list = f"user:{user_id}:books"
    key_book = f"user:{user_id}:book:{book_id}"

    r.delete(key_book)

    raw = r.get(key_list)
    books = json.loads(raw) if raw else []
    books = [b for b in books if b.get("id") != book_id]
    r.set(key_list, json.dumps(books))

    return jsonify({"success": True})


@metadata_bp.route("/<user_id>/clear_all_entries", methods=["DELETE"])
def clear_all_entries(user_id):
    """Delete all Redis metadata entries for the specified user."""
    r = redis.Redis.from_url(current_app.config["REDIS_URL"])
    pattern = f"user:{user_id}:book:*"
    book_keys = r.keys(pattern)
    deleted_count = 0
    if book_keys:
        deleted_count += r.delete(*book_keys)
    deleted_count += r.delete(f"user:{user_id}:books")
    current_app.logger.info(
        "Cleared %s Redis metadata entries for user %s", deleted_count, user_id
    )
    return jsonify({"deleted_count": deleted_count})
