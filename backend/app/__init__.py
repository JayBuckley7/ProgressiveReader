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
    load_dotenv()new bvt

    # Load additional configuration from a mounted secret if available
    secret_path = os.environ.get("APP_CONFIG_PATH", "/secrets/env.json")
    if os.path.exists(secret_path):
        try:
            with open(secret_path, "r") as f:
                config_data = json.load(f)
            for key, value in config_data.items():
                # Special handling for OPENAI_API_KEYS to preserve JSON array format
                if key == "OPENAI_API_KEYS" and isinstance(value, list):
                    os.environ.setdefault(key, json.dumps(value))
                else:
                    os.environ.setdefault(key, str(value))
        except Exception as e:
            logging.warning(f"Failed to load secrets from {secret_path}: {e}")
    app = Flask(
        __name__,
        static_folder="static",      # points at backend/app/static
        static_url_path=""           # serve at /
    )
    
    # Initialize CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
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
        health_status = {
            "status": "healthy",
            "clerk_secret_key_configured": bool(os.environ.get("CLERK_SECRET_KEY")),
            "clerk_publishable_key_configured": bool(os.environ.get("VITE_CLERK_PUBLISHABLE_KEY"))
        }
        
        # Add more details for debugging
        if os.environ.get("CLERK_SECRET_KEY"):
            clerk_secret = os.environ.get("CLERK_SECRET_KEY")
            health_status["clerk_secret_key_length"] = len(clerk_secret)
            health_status["clerk_secret_key_prefix"] = clerk_secret[:8] + "..." if len(clerk_secret) > 8 else clerk_secret
        
        if os.environ.get("VITE_CLERK_PUBLISHABLE_KEY"):
            clerk_pub = os.environ.get("VITE_CLERK_PUBLISHABLE_KEY")
            health_status["clerk_publishable_key_length"] = len(clerk_pub)
            health_status["clerk_publishable_key_prefix"] = clerk_pub[:8] + "..." if len(clerk_pub) > 8 else clerk_pub
        
        # Overall Clerk health status
        clerk_healthy = health_status["clerk_secret_key_configured"] and health_status["clerk_publishable_key_configured"]
        health_status["clerk_overall_healthy"] = clerk_healthy
        
        # Return 500 if Clerk is not properly configured
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
        from .routes import api  # API blueprint - this initializes the empty openai_key_pool
        from .routes import settings  # User settings endpoints
        from .routes import auth  # Authentication routes
        from .routes import drive  # Google Drive proxy routes
        from .routes import due_cards_google  # JPDB due cards with Google OAuth

        # Add keys to the pool after importing but before registering blueprints
        if openai_keys and isinstance(openai_keys, list):
            # Now that api module is imported, populate the pool
            api.openai_key_pool.extend(openai_keys)
            app.logger.info(f"Added {len(openai_keys)} OpenAI API keys to pool")
        else:
            app.logger.info("No valid OpenAI API keys found")
        
        # Register Blueprints
        app.register_blueprint(main.main_bp)
        app.register_blueprint(reader.reader_bp)
        app.register_blueprint(api.api_bp)
        app.register_blueprint(settings.settings_bp)
        app.register_blueprint(auth.auth_bp)
        app.register_blueprint(drive.drive_bp)
        app.register_blueprint(due_cards_google.due_cards_google_bp)

        db.create_all()

    app.logger.info("Flask app created successfully.")
    return app 
