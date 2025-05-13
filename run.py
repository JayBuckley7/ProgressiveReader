from app import create_app
import logging # Import the logging module

app = create_app()

if __name__ == '__main__':
    # You might want to configure host and port here for development
    # e.g., app.run(host='0.0.0.0', port=5001, debug=True)
    # For production, use a proper WSGI server like Gunicorn or Waitress
    
    # Ensure debug logging is active when running with app.run(debug=True)
    if app.debug:
        app.logger.setLevel(logging.DEBUG)
        # You can also set the Werkzeug logger to DEBUG if needed
        # logging.getLogger('werkzeug').setLevel(logging.DEBUG)
        app.logger.info("Flask development server running with DEBUG log level.")

    app.run(debug=True) # Default Flask development server 