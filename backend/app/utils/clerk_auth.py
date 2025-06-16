from functools import wraps
from flask import g

# Clerk authentication removed; stubs provide no-op decorators

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        g.user = None
        return f(*args, **kwargs)
    return decorated

optional_auth = require_auth

def get_current_user():
    return None

def get_user_id():
    return None

def get_user_email():
    return None
