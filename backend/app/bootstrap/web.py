"""Bootstrap: web-layer (CORS, SPA serving, health)."""

from __future__ import annotations

import os
from typing import Mapping


def configure_cors(app) -> None:
    from flask_cors import CORS

    CORS(
        app,
        resources={
            r"/*": {
                "origins": "*",
                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization"],
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
            return send_from_directory(app.static_folder, path)
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


__all__ = ["configure_cors", "register_spa_routes", "register_health_route"]
