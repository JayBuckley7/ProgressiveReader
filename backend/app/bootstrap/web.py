"""Bootstrap: web-layer (CORS, SPA serving, health)."""

from __future__ import annotations

import os
from typing import Mapping


def register_error_handlers(app):
    from flask import jsonify
    from ..core.errors import AppError

    @app.errorhandler(AppError)
    def application_error(error):
        return jsonify(code=error.code, error=error.message), error.status


def configure_cors(app) -> None:
    from flask_cors import CORS

    CORS(
        app,
        resources={
            r"/*": {
                "origins": "*",
                "methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization", "Idempotency-Key", "X-OCR-Account"],
            }
        },
    )


def register_spa_routes(app) -> None:
    from flask import send_from_directory, request

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path):
        # Check if it's an API request that should return 404 instead of serving the SPA
        if path.startswith("api/") or path.startswith("drive/"):
            return "API endpoint not found", 404

        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            # Dictionary loaders decompress these files themselves. Explicit MIME
            # prevents Werkzeug from adding Content-Encoding and browser decoding.
            return send_from_directory(app.static_folder, path, mimetype="application/gzip" if path.endswith(".gz") else None)
        return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(404)
    def redirect_404(e):
        # Only apply 404 handling to API requests, not UI routes
        if request.path.startswith("/api") or request.path.startswith("/drive"):
            return e
        return send_from_directory(app.static_folder, "index.html")


def register_health_route(app, *, env: Mapping[str, str]) -> None:
    from flask import jsonify

    @app.route("/health")
    def health_check():
        health_status = {
            "status": "healthy",
            "clerk_secret_key_configured": bool(env.get("CLERK_SECRET_KEY")),
            "secrets_file_exists": os.path.exists("/secrets/env.json"),
        }
        clerk_healthy = bool(env.get("CLERK_SECRET_KEY"))
        health_status["clerk_overall_healthy"] = clerk_healthy
        status_code = 200 if clerk_healthy else 500
        return jsonify(health_status), status_code

    @app.route('/ready')
    def ready():
        import json
        from pathlib import Path
        container = app.extensions.get('container')
        manifest = env.get('RECORDS_MIGRATION_MANIFEST')
        try:
            state = json.loads(Path(manifest).read_text(encoding='utf-8')) if manifest else {}
            migration_configured = state.get('schemaVersion') == 1 and isinstance(state.get('readyOwners'), list) and isinstance(state.get('pendingOwners'), list)
        except (OSError, ValueError, TypeError):
            migration_configured = False
        checks = {
            'auth_configured': bool(env.get('CLERK_SECRET_KEY')),
            'drive_configured': bool(container and container.drive_service.is_provider_configured()),
            'migration_configured': migration_configured,
            'dictionary_packaged': Path(env.get('KANJI_DATA_PATH') or str(Path(__file__).resolve().parents[3] / 'frontend/src/data/jlpt/kanjiapi_full.json')).is_file(),
        }
        return jsonify(status='ready' if all(checks.values()) else 'not_ready', checks=checks), 200 if all(checks.values()) else 503


__all__ = ["configure_cors", "register_spa_routes", "register_health_route"]
