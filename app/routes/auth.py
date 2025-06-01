"""Authentication routes using Flask-Login."""
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_user, logout_user, login_required, current_user
from ..utils.firebase_auth import firebase_token_or_login_required
from werkzeug.security import generate_password_hash, check_password_hash

from ..models import db, User

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/auth/register', methods=['POST'])
def register():
    """Register a new user and log them in."""
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({'error': 'Missing credentials'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'User exists'}), 400

    user = User(email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    login_user(user)
    return jsonify({'id': user.id})


@auth_bp.route('/auth/login', methods=['POST'])
def login():
    """Authenticate a user and start a session."""
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({'error': 'Missing credentials'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid credentials'}), 401

    login_user(user)
    return jsonify({'id': user.id})


@auth_bp.route('/auth/logout', methods=['POST'])
@firebase_token_or_login_required
def logout():
    """Log out the current user."""
    logout_user()
    return jsonify({'success': True})


@auth_bp.route('/auth/me', methods=['GET'])
@firebase_token_or_login_required
def me():
    """Return the authenticated user's ID and email."""
    return jsonify({'id': current_user.id, 'email': current_user.email})


@auth_bp.route('/auth/google/signin', methods=['POST'])
def google_signin():
    """Authenticate a user via Google access token and start a Flask-Login session."""
    data = request.get_json()
    access_token = data.get('access_token')  # Changed from id_token to access_token

    if not access_token:
        return jsonify({'error': 'Missing access token'}), 400

    try:
        # Use the access token to get user info from Google's userinfo endpoint
        import requests as http_requests
        userinfo_response = http_requests.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {access_token}'}
        )
        
        if not userinfo_response.ok:
            current_app.logger.error(f"Failed to get user info from Google: {userinfo_response.status_code}")
            return jsonify({'error': 'Failed to verify Google access token'}), 401
            
        user_info = userinfo_response.json()
        user_email = user_info.get('email')
        user_name = user_info.get('name')
        
        if not user_email:
            current_app.logger.error("No email in Google userinfo response")
            return jsonify({'error': 'No email found in Google account'}), 400

        # Check if user exists, otherwise create them
        user = User.query.filter_by(email=user_email).first()
        if not user:
            user = User(email=user_email, name=user_name) 
            db.session.add(user)
            db.session.commit()
            current_app.logger.info(f"New user created via Google Sign-In: {user_email}")
        else:
            # Optionally update user's name if they logged in with Google again
            if user_name and user.name != user_name:
                user.name = user_name
                db.session.commit()
            current_app.logger.info(f"User logged in via Google Sign-In: {user_email}")

        login_user(user)  # Establish Flask-Login session
        return jsonify({'id': user.id, 'email': user.email, 'name': user.name, 'message': 'Successfully signed in with Google'})

    except Exception as e:
        current_app.logger.error(f"An unexpected error occurred during Google sign-in: {str(e)}")
        return jsonify({'error': 'An unexpected error occurred', 'details': str(e)}), 500

