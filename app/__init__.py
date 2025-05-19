import os
import logging
from flask import Flask, send_from_directory, jsonify
from config import Config

# Define a filter for logging
class FilterImageRequests(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        # Filter successful GET requests for image URLs to reduce noise
        return not ('GET /image/' in msg and ' 200 ' in msg)

def create_app(config_class=Config) -> Flask:
    app = Flask(
        __name__, 
        instance_relative_config=False,
        template_folder='../templates' # Explicitly set template folder relative to app root
    )
    app.config.from_object(config_class)

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


    # --- Example: Add a simple test route directly here for now ---
    @app.route('/hello')
    def hello():
        return 'Hello, World from create_app!'
    # --- End Example ---

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
    # (This is where we'll add them later)
    with app.app_context():
        # Import parts of our application
        from .routes import main # Import the main blueprint
        from .routes import book # Import the book blueprint
        from .routes import reader # Import the reader blueprint
        from .routes import api # Import the api blueprint
        # Register Blueprints
        app.register_blueprint(main.main_bp)
        app.register_blueprint(book.book_bp) # Register the book blueprint
        app.register_blueprint(reader.reader_bp) # Register the reader blueprint
        app.register_blueprint(api.api_bp) # Register the api blueprint

        # You might also initialize extensions here if needed
        # e.g., db.init_app(app)

    app.logger.info("Flask app created successfully.")
    return app 