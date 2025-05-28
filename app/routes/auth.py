"""Simple authentication blueprint for tests."""

from flask import Blueprint, request, jsonify
from flask_login import LoginManager, login_user, login_required,
    current_user, logout_user, UserMixin

# In-memory store for test users
_users = {}

class User(UserMixin):
    """Simple user model using an ID only."""
    def __init__(self, user_id):
        self.id = user_id


auth_bp = Blueprint('auth', __name__, url_prefix='/auth')
login_manager = LoginManager()

@login_manager.user_loader
def load_user(user_id):
    return _users.get(user_id)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    user_id = data.get('id')
    if not user_id:
        return jsonify({'error': 'id required'}), 400
    user = _users.setdefault(user_id, User(user_id))
    login_user(user)
    return jsonify({'success': True})


@auth_bp.route('/me')
@login_required
def me():
    return jsonify({'id': current_user.id})


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'success': True})
