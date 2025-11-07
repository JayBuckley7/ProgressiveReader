"""Flask application factory that registers blueprints and routes."""
import os
import logging
from flask import Flask, send_from_directory, jsonify, redirect, url_for, request
from flask_cors import CORS
from config import Config
from .models import db
from dotenv import load_dotenv
import json

# Define a filter for logging
class FilterImageRequests(logging.Filter):
    def filter(self, record):
        """Suppress log records of successful image GET requests."""
        msg = record.getMessage()
        # Filter successful GET requests for image URLs to reduce noise
        return not ('GET /image/' in msg and ' 200 ' in msg)



def create_app(config_class=Config) -> Flask:
    load_dotenv()

    # Load additional configuration from a mounted secret if available
    # Prefer env_dev.json in development, fall back to env.json
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    is_dev = os.getenv("FLASK_ENV") == "development" or os.getenv("FLASK_DEBUG") == "1"

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
    
    # In production, require secrets file to exist
    is_production = os.getenv("APP_ENV") == "prod" or (not os.getenv("FLASK_ENV") == "development" and not os.getenv("FLASK_DEBUG") == "1")
    if is_production and not secret_path:
        logging.critical("❌ CRITICAL: Production secrets file not found at /secrets/env.json. Application cannot start.")
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

            logging.info(f"✅ Loaded configuration from {secret_path} (override_env={override_env})")
            logging.info(f"Loaded keys: {list(config_data.keys())}")

            # Auto-resolve Clerk test/live mismatch to prevent 401s in dev
            try:
                clerk_pub = os.environ.get("VITE_CLERK_PUBLISHABLE_KEY", "")
                clerk_sec = os.environ.get("CLERK_SECRET_KEY", "")

                def _load_secret_from(path: str, expected_prefix: str) -> str | None:
                    if not os.path.exists(path):
                        return None
                    try:
                        with open(path, "r", encoding="utf-8-sig") as fh:
                            data = json.load(fh)
                        cand = data.get("CLERK_SECRET_KEY")
                        if isinstance(cand, str) and cand.startswith(expected_prefix):
                            return cand
                    except Exception as ex:
                        logging.warning(f"Failed reading {path} for Clerk secret alignment: {ex}")
                    return None

                # If frontend uses pk_test but backend loaded sk_live, switch to test secret when available
                if clerk_pub.startswith("pk_test_") and clerk_sec.startswith("sk_live_"):
                    dev_candidates = [
                        os.path.join(root_dir, "env_dev.json"),
                        os.path.join(backend_dir, "env_dev.json"),
                    ]
                    for cand_path in dev_candidates:
                        new_secret = _load_secret_from(cand_path, "sk_test_")
                        if new_secret:
                            os.environ["CLERK_SECRET_KEY"] = new_secret
                            logging.warning("Adjusted CLERK_SECRET_KEY to test key to match publishable key (dev alignment)")
                            break

                # If frontend uses pk_live but backend loaded sk_test, switch to live secret when available
                if clerk_pub.startswith("pk_live_") and clerk_sec.startswith("sk_test_"):
                    prod_candidates = [
                        "/secrets/env.json",
                        os.path.join(root_dir, "env.json"),
                        os.path.join(backend_dir, "env.json"),
                    ]
                    for cand_path in prod_candidates:
                        new_secret = _load_secret_from(cand_path, "sk_live_")
                        if new_secret:
                            os.environ["CLERK_SECRET_KEY"] = new_secret
                            logging.warning("Adjusted CLERK_SECRET_KEY to live key to match publishable key (prod alignment)")
                            break
            except Exception as align_ex:
                logging.warning(f"Clerk key alignment step skipped due to error: {align_ex}")

        except Exception as e:
            logging.error(f"Failed to load secrets from {secret_path}: {e}")
            logging.error(f"Exception type: {type(e).__name__}, Exception details: {str(e)}")
            import traceback
            logging.error(f"Traceback: {traceback.format_exc()}")
            
            # In production, fail hard if secrets can't be loaded
            is_production = os.getenv("APP_ENV") == "prod" or not os.getenv("FLASK_ENV") == "development"
            if is_production and secret_path == "/secrets/env.json":
                logging.critical("❌ CRITICAL: Failed to load production secrets. Application cannot start.")
                import sys
                sys.exit(1)
    app = Flask(
        __name__,
        static_folder="static",      # points at backend/app/static
        static_url_path=""           # serve at /
    )
    
    # Initialize CORS - allow all routes for development
    CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})
    
    app.config.from_object(config_class)

    # Database configuration (production should use a durable backend)
    db_path = os.path.join(app.instance_path, 'app.db')
    app.config.setdefault('SQLALCHEMY_DATABASE_URI', f'sqlite:///{db_path}')
    app.config.setdefault('SQLALCHEMY_TRACK_MODIFICATIONS', False)

    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)
    app.config.update({
        "SESSION_COOKIE_SAMESITE": "Lax",
        "SESSION_COOKIE_SECURE": True,
    })

    app.logger.setLevel(logging.DEBUG)
    
    # Set up more detailed logging for debugging authentication issues
    logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    # Enable debug logging for Clerk auth specifically
    auth_logger = logging.getLogger('app.utils.clerk_auth')
    auth_logger.setLevel(logging.DEBUG)

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
            "clerk_publishable_key_configured": bool(os.environ.get("VITE_CLERK_PUBLISHABLE_KEY")),
            "secrets_file_exists": os.path.exists("/secrets/env.json"),
        }
        
        # Check if Clerk keys are configured (required for auth)
        clerk_healthy = (
            bool(os.environ.get("CLERK_SECRET_KEY")) and
            bool(os.environ.get("VITE_CLERK_PUBLISHABLE_KEY"))
        )
        
        # Overall health: Clerk keys must be configured
        health_status["clerk_overall_healthy"] = clerk_healthy
        
        # Return 500 if Clerk keys are missing (critical for app functionality)
        status_code = 200 if clerk_healthy else 500
        return jsonify(health_status), status_code
    # --- End Health Check Endpoint ---

    # --- Load OpenAI API keys BEFORE importing blueprints ---
    with app.app_context():
        # Load OpenAI API keys into the key pool first
        # This must happen before importing the api blueprint to avoid empty pool issue

        openai_keys = None
        
        # Load from environment variable (works for both local dev and production)
        openai_keys_json = os.environ.get("OPENAI_API_KEYS")
        if openai_keys_json:
            try:
                openai_keys = json.loads(openai_keys_json)
                app.logger.info("Loaded OpenAI keys from environment variable")
            except json.JSONDecodeError as e:
                app.logger.error(f"Failed to parse OPENAI_API_KEYS JSON: {e}")
        
        # --- Import parts of our application first ---
        from .routes import main  # Main UI blueprint
        from .routes import reader  # Reader blueprint
        
        # Import domain routes
        from .domains.translation.routes import translation_bp
        from .domains.vocabulary.routes import vocabulary_bp
        from .domains.kanji.routes import kanji_bp
        from .domains.books.routes import books_bp
        from .domains.admin.routes import admin_bp
        from .domains.auth.routes import auth_bp
        from .domains.drive import drive_bp as drive_domain_bp
        from .domains.ocr.routes import ocr_bp

        # Add keys to the pool after importing but before registering blueprints
        from .utils.openai_key_pool import get_openai_key_pool
        key_pool = get_openai_key_pool()
        if openai_keys and isinstance(openai_keys, list):
            for key in openai_keys:
                key_pool.add_key(key)
            app.logger.info(f"Added {len(openai_keys)} OpenAI API keys to pool")
        else:
            app.logger.info("No valid OpenAI API keys found")

        
        # Register Blueprints
        app.register_blueprint(main.main_bp)
        app.register_blueprint(reader.reader_bp)
        
        # Register domain blueprints
        app.register_blueprint(translation_bp)
        app.register_blueprint(vocabulary_bp)
        app.register_blueprint(kanji_bp)
        app.register_blueprint(books_bp)
        app.register_blueprint(admin_bp)
        app.register_blueprint(auth_bp)
        app.register_blueprint(drive_domain_bp)
        app.register_blueprint(ocr_bp)

        db.create_all()

    app.logger.info("Flask app created successfully.")
    return app 
