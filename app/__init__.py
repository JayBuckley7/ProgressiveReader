"""Flask application factory that registers blueprints and routes."""
import os
import logging
from flask import Flask, send_from_directory, jsonify
from flask_login import LoginManager
from config import Config
from .models import db, User

# Define a filter for logging
class FilterImageRequests(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        # Filter successful GET requests for image URLs to reduce noise
        return not ('GET /image/' in msg and ' 200 ' in msg)


login_manager = LoginManager()
login_manager.login_view = 'auth.login'


@login_manager.user_loader
def load_user(user_id: str):
    """Load a user for Flask-Login given their ID."""
    if user_id is None:
        return None
    return User.query.get(int(user_id))

def create_app(config_class=Config) -> Flask:
    app = Flask(
        __name__, 
        instance_relative_config=False,
        template_folder='../templates' # Explicitly set template folder relative to app root
    )
    app.config.from_object(config_class)

    # Database configuration
    db_path = os.path.join(app.instance_path, 'app.db')
    app.config.setdefault('SQLALCHEMY_DATABASE_URI', f'sqlite:///{db_path}')
    app.config.setdefault('SQLALCHEMY_TRACK_MODIFICATIONS', False)

    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)
    login_manager.init_app(app)

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
        from .routes import metadata  # Redis metadata endpoints
        from .routes import auth  # Authentication routes
        # Register Blueprints
        app.register_blueprint(main.main_bp)
        app.register_blueprint(reader.reader_bp)
        app.register_blueprint(api.api_bp)
        app.register_blueprint(metadata.metadata_bp)
        app.register_blueprint(auth.auth_bp)

        if not os.path.exists(db_path):
            db.create_all()

    app.logger.info("Flask app created successfully.")
    return app 
