from __future__ import annotations

from types import SimpleNamespace

from app.domains.auth.adapters import clerk as clerk_module


class _DummyUsers:
    def __init__(self, raw_user: object | None = None, error: Exception | None = None) -> None:
        self._raw_user = raw_user
        self._error = error

    def get(self, user_id: str):
        _ = user_id
        if self._error is not None:
            raise self._error
        return self._raw_user


class _DummyClient:
    def __init__(self, raw_user: object | None = None, error: Exception | None = None) -> None:
        self.users = _DummyUsers(raw_user=raw_user, error=error)


class _DummyTokenVerificationError(Exception):
    def __init__(self, reason: object) -> None:
        super().__init__("token verification failed")
        self.reason = reason


def _install_clerk_stubs(monkeypatch, *, claims: dict[str, str], client: _DummyClient) -> None:
    monkeypatch.setattr(clerk_module, "Clerk", lambda bearer_auth: client)
    monkeypatch.setattr(clerk_module, "VerifyTokenOptions", lambda secret_key: SimpleNamespace(secret_key=secret_key))
    monkeypatch.setattr(clerk_module, "TokenVerificationError", _DummyTokenVerificationError)
    monkeypatch.setattr(clerk_module, "verify_token", lambda token, options: claims)


def test_get_current_user_from_headers_returns_profile_fields(monkeypatch):
    raw_user = SimpleNamespace(
        id="user_123",
        first_name="Ada",
        last_name="Lovelace",
        username="ada",
        image_url="https://example.com/avatar.png",
        created_at="2026-04-21T12:00:00Z",
        email_addresses=[SimpleNamespace(email_address="ada@example.com")],
    )
    _install_clerk_stubs(
        monkeypatch,
        claims={"sid": "session_123", "sub": "user_123"},
        client=_DummyClient(raw_user=raw_user),
    )

    provider = clerk_module.ClerkAuthProvider(secret_key="sk_test")

    user = provider.get_current_user_from_headers({"Authorization": "Bearer token"})

    assert user is not None
    assert user.id == "user_123"
    assert user.email == "ada@example.com"
    assert user.first_name == "Ada"
    assert user.last_name == "Lovelace"
    assert user.username == "ada"
    assert user.image_url == "https://example.com/avatar.png"
    assert user.created_at == "2026-04-21T12:00:00Z"


def test_get_current_user_from_headers_falls_back_to_session_identity_on_lookup_timeout(monkeypatch):
    _install_clerk_stubs(
        monkeypatch,
        claims={"sid": "session_123", "sub": "user_123"},
        client=_DummyClient(raw_user=None),
    )

    def fake_call_with_timeout(label: str, timeout_seconds: float, fn):
        if label == "Clerk user lookup":
            raise clerk_module.TimeoutExceededError(label=label, timeout_seconds=timeout_seconds)
        return fn()

    monkeypatch.setattr(clerk_module, "call_with_timeout", fake_call_with_timeout)

    provider = clerk_module.ClerkAuthProvider(secret_key="sk_test")

    user = provider.get_current_user_from_headers({"Authorization": "Bearer token"})

    assert user is not None
    assert user.id == "user_123"
    assert user.email is None
    assert user.first_name is None


def test_verify_token_returns_none_when_verification_times_out(monkeypatch):
    _install_clerk_stubs(
        monkeypatch,
        claims={"sid": "session_123", "sub": "user_123"},
        client=_DummyClient(raw_user=None),
    )

    def fake_call_with_timeout(label: str, timeout_seconds: float, fn):
        raise clerk_module.TimeoutExceededError(label=label, timeout_seconds=timeout_seconds)

    monkeypatch.setattr(clerk_module, "call_with_timeout", fake_call_with_timeout)

    provider = clerk_module.ClerkAuthProvider(secret_key="sk_test")

    assert provider.verify_token("token") is None
