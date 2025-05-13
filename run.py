from app import create_app

app = create_app()

if __name__ == '__main__':
    # You might want to configure host and port here for development
    # e.g., app.run(host='0.0.0.0', port=5001, debug=True)
    # For production, use a proper WSGI server like Gunicorn or Waitress
    app.run(debug=True) # Default Flask development server 