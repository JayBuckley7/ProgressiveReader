"""Flask application factory that registers blueprints and routes."""
from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING

from .utils.runtime_env import is_dev_env, is_test_env

if TYPE_CHECKING:
    from flask import Flask

# Define a filter for logging
class FilterImageRequests(logging.Filter):
    def filter(self, record):
        """Suppress log records of successful image GET requests."""
        msg = record.getMessage()
        # Filter successful GET requests for image URLs to reduce noise
        return not ('GET /image/' in msg and ' 200 ' in msg)



def create_app(config_class=None) -> Flask:
    # Import Flask and related dependencies lazily so domain modules can be
    # imported in lightweight unit tests without requiring the full web stack.
    from dotenv import load_dotenv
    from flask import Flask, send_from_directory, jsonify, request
    from flask_cors import CORS

    from .models import db

    load_dotenv()

    log_level = logging.DEBUG if is_dev_env() else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Load additional configuration from a mounted secret if available
    # Prefer env_dev.json in development, fall back to env.json
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    is_dev = is_dev_env()

    possible_paths = [
        os.environ.get("APP_CONFIG_PATH"),  # Explicitly configured path takes precedence
    ]

    if is_dev:
        possible_paths += [
            os.path.join(root_dir, "env_dev.json"),   # Project root dev config
            os.path.join(backend_dir, "env_dev.json"),  # Backend dir dev config
        ]

    possible_paths += [
        "/secrets/env.json",  # Production path (Linux secrets mount)
        os.path.join(root_dir, "env.json"),  # Project root
        os.path.join(backend_dir, "env.json"),  # Backend directory
    ]
    
    secret_path = None
    for path in possible_paths:
        if path and os.path.exists(path):
            secret_path = path
            break
    
    # In production, require secrets file to exist. Outside production, allow
    # running without mounted secrets (local dev + unit tests).
    is_production = os.getenv("APP_ENV") == "prod"
    if is_production and not secret_path:
        logging.critical("CRITICAL: Production secrets file not found at /secrets/env.json. Application cannot start.")
        import sys
        sys.exit(1)
    
    if secret_path:
        try:
            with open(secret_path, "r", encoding="utf-8-sig") as f:
                config_data = json.load(f)

            # Override env vars if explicitly loading via APP_CONFIG_PATH or using env_dev.json
            override_env = bool(os.environ.get("APP_CONFIG_PATH")) or (
                os.path.basename(secret_path).lower() == "env_dev.json"
            )

            for key, value in config_data.items():
                # Special handling for OPENAI_API_KEYS to preserve JSON array format
                if key == "OPENAI_API_KEYS" and isinstance(value, list):
                    if override_env:
                        os.environ[key] = json.dumps(value)
                    else:
                        os.environ.setdefault(key, json.dumps(value))
                # Special handling for GOOGLE_APPLICATION_CREDENTIALS_JSON to preserve JSON object format
                elif key == "GOOGLE_APPLICATION_CREDENTIALS_JSON" and isinstance(value, dict):
                    if override_env:
                        os.environ[key] = json.dumps(value)
                    else:
                        os.environ.setdefault(key, json.dumps(value))
                else:
                    if override_env:
                        os.environ[key] = str(value)
                    else:
                        os.environ.setdefault(key, str(value))

            logging.info(f"Loaded configuration from {secret_path} (override_env={override_env})")
            logging.debug("Loaded config keys: %s", list(config_data.keys()))
            # If keys are configured, warn about test/live mismatches (do not mutate secrets at runtime).
            clerk_pub = os.environ.get("VITE_CLERK_PUBLISHABLE_KEY", "")
            clerk_sec = os.environ.get("CLERK_SECRET_KEY", "")
            if clerk_pub.startswith("pk_test_") and clerk_sec.startswith("sk_live_"):
                logging.warning("Clerk key mismatch: publishable key is test but secret key is live (fix env config).")
            if clerk_pub.startswith("pk_live_") and clerk_sec.startswith("sk_test_"):
                logging.warning("Clerk key mismatch: publishable key is live but secret key is test (fix env config).")

        except Exception as e:
            logging.error(f"Failed to load secrets from {secret_path}: {e}")
            logging.error(f"Exception type: {type(e).__name__}, Exception details: {str(e)}")
            import traceback
            logging.error(f"Traceback: {traceback.format_exc()}")
            
            # In production, fail hard if secrets can't be loaded
            if is_production and secret_path == "/secrets/env.json":
                logging.critical("CRITICAL: Failed to load production secrets. Application cannot start.")
                import sys
                sys.exit(1)

    # Import Config after env is loaded, so env-backed class attributes aren't
    # frozen before dotenv/env.json are applied.
    if config_class is None:
        from config import Config as _DefaultConfig

        config_class = _DefaultConfig

    app = Flask(
        __name__,
        static_folder="static",  # points at backend/app/static
        static_url_path="",  # serve at /
    )
    
    # Initialize CORS - allow all routes for development
    CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})
    
    app.config.from_object(config_class)
    if is_test_env():
        # Enable translation routes in unit tests without requiring real secrets.
        app.config.setdefault("OPENAI_API_KEY", "test-key")

    # Database configuration (production should use a durable backend)
    db_path = os.path.join(app.instance_path, 'app.db')
    app.config.setdefault('SQLALCHEMY_DATABASE_URI', f'sqlite:///{db_path}')
    app.config.setdefault('SQLALCHEMY_TRACK_MODIFICATIONS', False)

    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)

    app.logger.setLevel(log_level)

    # Keep auth logs consistent with the global log level.
    logging.getLogger("app.utils.clerk_auth").setLevel(log_level)

    # Configure Werkzeug logger filtering
    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.addFilter(FilterImageRequests())

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path):
        """
        Let React/Vite router handle every route, always return index.html
        """
        # Check if it's an API request that should return 404 instead of serving the SPA
        if path.startswith("api/"):
            return "API endpoint not found", 404
            
        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        else:
            return send_from_directory(app.static_folder, "index.html")

    @app.errorhandler(404)
    def redirect_404(e):
        """Only redirect API requests to 404, let SPA handle UI routes."""
        # Only apply 404 handling to API requests, not UI routes
        if request.path.startswith("/api"):
            return e
        # For non-API routes, let the SPA route handler above deal with it
        # This should not be reached for normal UI routes
        return send_from_directory(app.static_folder, "index.html")

    # --- Health Check Endpoint ---
    @app.route('/health')
    def health_check():
        """
        Health check endpoint that verifies essential configuration.
        Returns 200 if critical services are configured, 500 otherwise.
        """
        health_status = {
            "status": "healthy",
            "clerk_secret_key_configured": bool(os.environ.get("CLERK_SECRET_KEY")),
            "secrets_file_exists": os.path.exists("/secrets/env.json"),
        }
        
        # Backend requires Clerk secret key for authenticated APIs. Publishable key is a frontend concern.
        clerk_healthy = bool(os.environ.get("CLERK_SECRET_KEY"))
        
        # Overall health: Clerk keys must be configured
        health_status["clerk_overall_healthy"] = clerk_healthy
        
        # Return 500 if Clerk keys are missing (critical for app functionality)
        status_code = 200 if clerk_healthy else 500
        return jsonify(health_status), status_code
    # --- End Health Check Endpoint ---

    # --- Composition root (hex wiring) ---
    with app.app_context():
        from .container import create_container
        from .settings import load_settings

        settings = load_settings(env=os.environ, flask_config=app.config)
        app.extensions["container"] = create_container(settings=settings)
        
        # Import domain routes
        from .domains.translation.routes import translation_bp
        from .domains.vocabulary.routes import vocabulary_bp
        from .domains.kanji.routes import kanji_bp
        from .domains.books.routes import books_bp
        from .domains.grammar.routes import grammar_bp
        from .domains.mix.routes import mix_bp
        from .domains.admin.routes import admin_bp
        from .domains.auth.routes import auth_bp
        from .domains.drive import drive_bp as drive_domain_bp
        from .domains.ocr.routes import ocr_bp

        # Register domain blueprints
        app.register_blueprint(translation_bp)
        app.register_blueprint(vocabulary_bp)
        app.register_blueprint(kanji_bp)
        app.register_blueprint(books_bp)
        app.register_blueprint(grammar_bp)
        app.register_blueprint(mix_bp)
        app.register_blueprint(admin_bp)
        app.register_blueprint(auth_bp)
        app.register_blueprint(drive_domain_bp)
        app.register_blueprint(ocr_bp)

        db.create_all()

    app.logger.info("Flask app created successfully.")
    return app 
