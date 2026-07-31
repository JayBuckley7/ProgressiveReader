"""Entry point for running the Flask development server."""
from app import create_app
import logging # Import the logging module
import os
import sys

# Running this file directly is the local development entry point. Select the
# development secrets before creating the app so Clerk's frontend and backend
# keys always come from the same instance.
if __name__ == "__main__":
    os.environ.setdefault("APP_ENV", "development")

app = create_app()

if __name__ == '__main__':
    # Ensure debug logging is active when running with app.run(debug=True)
    if app.debug:
        app.logger.setLevel(logging.DEBUG)
        app.logger.info("Flask development server running with DEBUG log level.")

    # Configure extra files to watch for changes
    extra_files = []
    for root, dirs, files in os.walk('app'):
        for file in files:
            if file.endswith('.py') or file.endswith('.html') or file.endswith('.js') or file.endswith('.css'):
                extra_files.append(os.path.join(root, file))
    
    # Add templates directory
    for root, dirs, files in os.walk('templates'):
        for file in files:
            if file.endswith('.html'):
                extra_files.append(os.path.join(root, file))
    
    app.logger.info(f"Watching {len(extra_files)} files for changes")
    
    # Detect if running under debugger
    is_debugging = 'debugpy' in sys.modules or any('debugpy' in arg for arg in sys.argv)
    
    if is_debugging:
        # When debugging with VS Code, disable Flask's reloader to avoid conflicts
        app.logger.info("Debugger detected: disabling Flask reloader, serving on 0.0.0.0:5000")
        app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
    else:
        # Normal mode with hot reload enabled
        app.logger.info("Running with hot reload enabled, serving on 0.0.0.0:5000")
        app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=True, extra_files=extra_files) 
