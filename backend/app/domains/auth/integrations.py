from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
import os
import jwt
import logging

try:
    from clerk_backend_api import Clerk  # type: ignore
except Exception:  # pragma: no cover - optional at test time
    Clerk = None  # type: ignore

from .schemas import SessionInfo


logger = logging.getLogger(__name__)


class AuthProvider(ABC):
    @abstractmethod
    def verify_token(self, token: str) -> Optional[SessionInfo]:
        raise NotImplementedError

    @abstractmethod
    def get_current_user_from_headers(self, headers: Dict[str, str]) -> Optional[Any]:
        """Return the raw user object for compatibility, or None if not authenticated."""
        raise NotImplementedError

    @abstractmethod
    def is_admin(self, user_id: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def get_settings(self, user_id: str) -> Dict[str, Any]:
        """Get user settings from private metadata."""
        raise NotImplementedError

    @abstractmethod
    def save_settings(self, user_id: str, settings: Dict[str, Any]) -> bool:
        """Save user settings to private metadata."""
        raise NotImplementedError


class ClerkAuthProvider(AuthProvider):
    def __init__(self, secret_key: Optional[str] = None) -> None:
        key = secret_key or os.getenv("CLERK_SECRET_KEY")
        if not key or Clerk is None:
            # In development, missing CLERK_SECRET_KEY is expected, so log at DEBUG level
            # In production, this would be a configuration error
            # Check for development indicators: FLASK_ENV, FLASK_DEBUG, or local env.json
            is_dev = (
                os.getenv("FLASK_ENV") == "development" 
                or os.getenv("FLASK_DEBUG") == "1"
                or os.path.exists(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "env.json"))  # Project root
                or os.path.exists(os.path.join(os.path.dirname(os.path.dirname(__file__)), "env.json"))  # Backend directory
            )
            if is_dev:
                logger.debug("ClerkAuthProvider not initialized; missing CLERK_SECRET_KEY or Clerk SDK (expected in development)")
            else:
                logger.warning("ClerkAuthProvider not initialized; missing CLERK_SECRET_KEY or Clerk SDK")
            self.client = None
        else:
            self.client = Clerk(bearer_auth=key)

    def verify_token(self, token: str) -> Optional[SessionInfo]:
        if not self.client:
            logger.warning("🔐 [AUTH] Clerk client not initialized in verify_token")
            return None
        try:
            # Decode unverified to extract claims
            unverified = jwt.decode(token, options={"verify_signature": False})
            session_id = unverified.get("sid")
            user_id = unverified.get("sub")
            logger.debug(f"🔐 [AUTH] Token decoded - user_id: {user_id}, session_id: {session_id}")
            if not session_id or not user_id:
                logger.warning("🔐 [AUTH] Token missing required claims (sid or sub)")
                return None
            # Ensure user exists
            user = self.client.users.get(user_id=user_id)
            if not user:
                logger.warning(f"🔐 [AUTH] User {user_id} not found in Clerk")
                return None
            logger.debug(f"🔐 [AUTH] User verified: {user_id}")
            return SessionInfo(user_id=user_id, session_id=session_id, status="verified")
        except Exception as exc:
            logger.error("Error verifying Clerk session token: %s", exc, exc_info=True)
            return None

    def _extract_bearer(self, headers: Dict[str, str]) -> Optional[str]:
        auth_header = headers.get("Authorization") or headers.get("authorization")
        if not auth_header:
            return None
        parts = auth_header.split(" ")
        if len(parts) != 2 or parts[0] != "Bearer":
            return None
        return parts[1]

    def get_current_user_from_headers(self, headers: Dict[str, str]) -> Optional[Any]:
        if not self.client:
            logger.warning("🔐 [AUTH] Clerk client not initialized in get_current_user_from_headers")
            return None
        token = self._extract_bearer(headers)
        if not token:
            logger.warning("🔐 [AUTH] No bearer token found in headers")
            return None
        logger.debug(f"🔐 [AUTH] Bearer token extracted: {token[:20]}...")
        session = self.verify_token(token)
        if not session:
            logger.warning("🔐 [AUTH] Token verification failed")
            return None
        logger.debug(f"🔐 [AUTH] Token verified, session: {session.user_id}")
        try:
            user = self.client.users.get(user_id=session.user_id)
            logger.debug(f"🔐 [AUTH] User retrieved successfully: {user.id}")
            return user
        except Exception as exc:
            logger.error("Error retrieving Clerk user: %s", exc, exc_info=True)
            return None

    def is_admin(self, user_id: str) -> bool:
        if not self.client:
            return False
        try:
            # Prefer users.get_organization_memberships if available
            try:
                memberships = self.client.users.get_organization_memberships(user_id=user_id)
                data = getattr(memberships, "data", [])
            except Exception:
                # Fallback to organization_memberships.list for some SDK versions
                memberships = self.client.organization_memberships.list(user_id=[user_id])
                data = getattr(memberships, "data", [])

            for m in data:
                org = getattr(m, "organization", None)
                org_name = getattr(org, "name", "") if org else ""
                role = (getattr(m, "role", "") or "").lower()
                if org_name == "ProgressiveReader" and (role == "admin" or role == "org:admin"):
                    return True
            return False
        except Exception as exc:
            logger.error("Error checking admin membership: %s", exc)
            return False

    def get_settings(self, user_id: str) -> Dict[str, Any]:
        """Get user settings from Clerk private metadata."""
        if not self.client:
            raise ValueError("Clerk client not configured")
        try:
            user = self.client.users.get(user_id=user_id)
            if not user:
                raise ValueError("User not found")
            settings = (user.private_metadata or {}).get("settings", {}) or {}
            return settings if isinstance(settings, dict) else {}
        except Exception as exc:
            logger.error("Error getting settings: %s", exc)
            raise

    def save_settings(self, user_id: str, settings: Dict[str, Any]) -> bool:
        """Save user settings to Clerk private metadata."""
        if not self.client:
            raise ValueError("Clerk client not configured")
        try:
            user = self.client.users.get(user_id=user_id)
            if not user:
                raise ValueError("User not found")

            # Preserve all existing private_metadata keys
            private_meta = dict(user.private_metadata or {})
            current = private_meta.get("settings", {}) or {}
            if isinstance(current, dict):
                current.update(settings)
            else:
                current = settings

            private_meta["settings"] = current

            self.client.users.update_metadata(
                user_id=user_id,
                private_metadata=private_meta,
            )
            return True
        except Exception as exc:
            logger.error("Error saving settings: %s", exc)
            raise


class JwtAuthProvider(AuthProvider):
    """Placeholder for local JWT or alternative auth."""

    def verify_token(self, token: str) -> Optional[SessionInfo]:  # pragma: no cover - placeholder
        return None

    def get_current_user_from_headers(self, headers: Dict[str, str]) -> Optional[Any]:  # pragma: no cover - placeholder
        return None

    def is_admin(self, user_id: str) -> bool:  # pragma: no cover - placeholder
        return False

    def get_settings(self, user_id: str) -> Dict[str, Any]:  # pragma: no cover - placeholder
        return {}

    def save_settings(self, user_id: str, settings: Dict[str, Any]) -> bool:  # pragma: no cover - placeholder
        return False


