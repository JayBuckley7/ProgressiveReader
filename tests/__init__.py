from unittest.mock import MagicMock
from google.cloud import firestore
import sys
import types
import os
import tempfile
import pytest
from app import create_app # Assuming your Flask app factory is named create_app
from app.extensions import db # Assuming you have a db object for SQLAlchemy
# Import other necessary modules for testing, e.g., models

# Use a dummy Firestore client during unit tests to avoid credential lookups
firestore.Client = MagicMock(return_value=MagicMock())
sys.modules.setdefault('redis', MagicMock())

import app.routes.metadata as metadata
if not hasattr(metadata, 'redis'):
    metadata.redis = types.SimpleNamespace(Redis=MagicMock())

@pytest.fixture(scope='session')
def app():
    """Session-wide test Flask application."""
    # Ensure environment variables are set for testing
    os.environ['FLASK_ENV'] = 'testing'
    # Use a temporary SQLite database for tests
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    os.environ['DATABASE_URL'] = f'sqlite:///{db_path}'
    # If you use other services like OpenAI, you might want to mock them or use test keys
    # os.environ['OPENAI_API_KEY'] = 'test_openai_key' 

    app = create_app() # Create an instance of the app

    with app.app_context():
        db.create_all() # Create database tables

    yield app

    # Teardown: close and remove the temporary database
    os.close(db_fd)
    os.unlink(db_path)

@pytest.fixture()
def client(app):
    """A test client for the app."""
    return app.test_client()

@pytest.fixture()
def runner(app):
    """A test runner for the app's Click commands."""
    return app.test_cli_runner()

# You can add other global fixtures here, for example, to set up a test user
# or to mock external services.
