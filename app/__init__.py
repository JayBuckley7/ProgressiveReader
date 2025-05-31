"""Flask application factory that registers blueprints and routes."""
import os
import json
import logging
from flask import Flask, send_from_directory, jsonify, render_template, url_for
from flask_login import LoginManager
try:
    from flask_cors import CORS
except ImportError:  # unit-test fallback only
    class CORS:  # noqa: D401, E302
        def __init__(self, *_a, **_kw):
            ...

        def init_app(self, app, **_kw):
            app.logger.debug("CORS stub")
from config import Config
from .models import db, User
from dotenv import load_dotenv

# Define a filter for logging
class FilterImageRequests(logging.Filter):
    def filter(self, record):
        """Suppress log records of successful image GET requests."""
        msg = record.getMessage()
        # Filter successful GET requests for image URLs to reduce noise
        return not ('GET /image/' in msg and ' 200 ' in msg)


login_manager = LoginManager()
login_manager.login_view = 'auth.login'

@login_manager.unauthorized_handler
def _unauth():
    """Return a 401 JSON response for unauthorized API calls."""
    return jsonify(error='Auth required'), 401


@login_manager.user_loader
def load_user(user_id: str):
    """Load a user for Flask-Login given their ID."""
    if user_id is None:
        return None
    return User.query.get(int(user_id))

def create_app(config_class=Config) -> Flask:
    load_dotenv()
    app = Flask(
        __name__, 
        instance_relative_config=False,
        template_folder='../templates' # Explicitly set template folder relative to app root
    )
    app.config.from_object(config_class)

    # Database configuration (production should use a durable backend)
    db_path = os.path.join(app.instance_path, 'app.db')
    app.config.setdefault('SQLALCHEMY_DATABASE_URI', f'sqlite:///{db_path}')
    app.config.setdefault('SQLALCHEMY_TRACK_MODIFICATIONS', False)

    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)
    login_manager.init_app(app)
    CORS().init_app(app)

    manifest_cache: dict | None = None

    def vite_asset(filename: str) -> str:
        """Return the path to a Vite-built asset using the manifest if present."""
        nonlocal manifest_cache
        if manifest_cache is None:
            manifest_path = os.path.join(app.static_folder, 'dist', 'manifest.json')
            if os.path.exists(manifest_path):
                try:
                    with open(manifest_path) as f:
                        manifest_cache = json.load(f)
                except Exception as exc:  # pragma: no cover - runtime safeguard
                    app.logger.debug(f"Vite manifest read failed: {exc}")
                    manifest_cache = {}
            else:
                manifest_cache = {}
        entry = manifest_cache.get(filename) if manifest_cache else None
        if isinstance(entry, dict) and 'file' in entry:
            return url_for('static', filename=f"dist/{entry['file']}")
        return url_for('static', filename=f'dist/{filename}')

    app.jinja_env.globals['vite_asset'] = vite_asset
    app.config.update({
        "SESSION_COOKIE_SAMESITE": "Lax",
        "SESSION_COOKIE_SECURE": True,
    })

    app.logger.setLevel(logging.DEBUG)

    # Configure Werkzeug logger filtering
    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.addFilter(FilterImageRequests())

    # Ensure the upload folder exists
    upload_folder_path = os.path.join(app.root_path, '..', app.config['UPLOAD_FOLDER'])
    upload_folder_abs_path = os.path.abspath(upload_folder_path)
    if not os.path.exists(upload_folder_abs_path):
        try:
            os.makedirs(upload_folder_abs_path)
            app.logger.info(f"Created upload directory: {upload_folder_abs_path}")
        except OSError as e:
            app.logger.error(f"Error creating upload directory {upload_folder_abs_path}: {e}")



    # --- Add routes for PWA resources ---
    @app.route('/offline')
    def offline():
        return send_from_directory('static', 'offline.html')
        
    @app.route('/service-worker.js')
    def service_worker():
        return send_from_directory('static/js', 'service-worker.js')
        
    @app.route('/manifest.json')
    def manifest():
        return send_from_directory('static', 'manifest.json')
    # --- End PWA routes ---

    # --- Health Check Endpoint ---
    @app.route('/health')
    def health_check():
        return jsonify({"status": "healthy"}), 200
    # --- End Health Check Endpoint ---

    # --- Import and register blueprints from routes ---
    with app.app_context():
        # Import parts of our application
        from .routes import main  # Main UI blueprint
        from .routes import reader  # Reader blueprint
        from .routes import api  # API blueprint
        from .routes import metadata  # Firestore metadata endpoints
        from .routes import settings  # User settings endpoints
        from .routes import auth  # Authentication routes
        # Register Blueprints
        app.register_blueprint(main.main_bp)
        app.register_blueprint(reader.reader_bp)
        app.register_blueprint(api.api_bp)
        app.register_blueprint(metadata.metadata_bp)
        app.register_blueprint(settings.settings_bp)
        app.register_blueprint(auth.auth_bp)

        db.create_all()

    @app.route('/', defaults={'path': ''}, methods=['GET'])
    @app.route('/<path:path>', methods=['GET'])
    def spa_fallback(path: str):
        """Serve the React application for non-API routes."""
        dist = os.path.join(app.static_folder, 'dist')
        index_file = os.path.join(dist, 'index.html')
        if os.path.exists(index_file):
            return send_from_directory(dist, 'index.html')
        return render_template('index.html')

    app.logger.info("Flask app created successfully.")
    return app
