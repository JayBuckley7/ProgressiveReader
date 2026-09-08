import os
from types import SimpleNamespace
import pytest

os.environ.setdefault("PYTHONWARNINGS", "ignore")


@pytest.fixture
def authenticated_client():
    """Inject identity, while real decorators still enforce authentication."""
    def make(app):
        user = SimpleNamespace(id="test-user", email=None)
        app.extensions["auth_service"] = SimpleNamespace(
            get_current_user_from_headers=lambda headers: user if headers.get("Authorization") == "Bearer test-user" else None,
            is_admin=lambda user_id: user_id == "test-user",
        )
        client = app.test_client()
        client.environ_base["HTTP_AUTHORIZATION"] = "Bearer test-user"
        return client
    return make


