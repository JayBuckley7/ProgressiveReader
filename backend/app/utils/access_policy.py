"""HTTP capability checks. Funding is deliberately disabled without shared budgets."""
from functools import wraps
from flask import jsonify, request


def server_ai_disabled():
    return jsonify(code="SERVER_AI_DISABLED", error="Server-funded AI and OCR are disabled. Use your own AI key for translation, grammar, or mix."), 403


def require_user_ai_key(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not data:
            return jsonify(code="INVALID_REQUEST", error="Invalid JSON payload"), 400
        key = data.get("api_key") or data.get("apiKey")
        if not isinstance(key, str) or not key.strip():
            return server_ai_disabled()
        return fn(*args, **kwargs)
    return wrapped
