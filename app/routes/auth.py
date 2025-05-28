"""Authentication routes using Flask-Login."""
from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
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
@login_required
def logout():
    """Log out the current user."""
    logout_user()
    return jsonify({'success': True})


@auth_bp.route('/auth/me', methods=['GET'])
@login_required
def me():
    """Return the authenticated user's ID and email."""
    return jsonify({'id': current_user.id, 'email': current_user.email})

