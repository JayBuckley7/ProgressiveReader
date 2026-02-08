from __future__ import annotations

import logging
from typing import Any, Dict, Optional, List

from ..ports import AuthProviderPort
from ..schemas import SessionInfo
from ....utils.runtime_env import is_dev_env

try:
    from clerk_backend_api import Clerk  # type: ignore
except Exception:  # pragma: no cover - optional at test time
    Clerk = None  # type: ignore

# Clerk's Python SDK includes helpers to verify session JWTs via JWKS fetched from
# Clerk's backend API. Keep the import optional so lightweight unit tests can
# still import the module without Clerk installed.
try:  # pragma: no cover - exercised in integration environments
    from clerk_backend_api.jwks_helpers import VerifyTokenOptions, TokenVerificationError, verify_token  # type: ignore
except Exception:  # pragma: no cover - optional at test time
    VerifyTokenOptions = None  # type: ignore
    TokenVerificationError = None  # type: ignore
    verify_token = None  # type: ignore

logger = logging.getLogger(__name__)


class ClerkAuthProvider(AuthProviderPort):
    def __init__(self, secret_key: Optional[str] = None) -> None:
        # The container is responsible for reading env/config.
        key = (secret_key or "").strip() or None
        self._secret_key = key
        if not self._secret_key or Clerk is None:
            # In development, missing Clerk configuration is expected.
            if is_dev_env():
                logger.debug(
                    "ClerkAuthProvider not initialized; missing secret_key or Clerk SDK (expected in development)"
                )
            else:
                logger.warning("ClerkAuthProvider not initialized; missing secret_key or Clerk SDK")
            self.client = None
        else:
            self.client = Clerk(bearer_auth=self._secret_key)

    def verify_token(self, token: str) -> Optional[SessionInfo]:
        if not self._secret_key:
            logger.warning("[auth] Clerk secret key not configured in verify_token")
            return None
        try:
            # Verify JWT with Clerk (JWKS is resolved via Clerk Backend API).
            # This replaces the previous `verify_signature=False` decode, which was insecure.
            if not (verify_token and VerifyTokenOptions and TokenVerificationError):
                logger.warning("[auth] Clerk JWKS helpers not available; cannot verify token")
                return None

            claims = verify_token(token, VerifyTokenOptions(secret_key=self._secret_key))  # type: ignore[misc]
            session_id = claims.get("sid")
            user_id = claims.get("sub")
            logger.debug("[auth] Token verified user_id=%s session_id=%s", user_id, session_id)
            if not session_id or not user_id:
                logger.warning("[auth] Token missing required claims (sid or sub)")
                return None
            return SessionInfo(user_id=user_id, session_id=session_id, status="verified")
        except Exception as exc:
            # TokenVerificationError is an optional import; detect by name safely.
            if TokenVerificationError and isinstance(exc, TokenVerificationError):  # type: ignore[arg-type]
                logger.warning("[auth] Token verification failed: %s", exc.reason.value[0])
                return None
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
        if not self._secret_key:
            logger.warning("[auth] Clerk secret key not configured in get_current_user_from_headers")
            return None
        if not self.client:
            logger.warning("[auth] Clerk client not initialized in get_current_user_from_headers")
            return None
        token = self._extract_bearer(headers)
        if not token:
            logger.warning("[auth] No bearer token found in headers")
            return None
        session = self.verify_token(token)
        if not session:
            logger.warning("[auth] Token verification failed")
            return None
        logger.debug("[auth] Token verified; session user_id=%s", session.user_id)
        try:
            user = self.client.users.get(user_id=session.user_id)
            logger.debug("[auth] User retrieved successfully: %s", user.id)
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

            # Preserve all existing private_metadata keys.
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

    def get_organization_memberships(self, user_id: str) -> List[Dict[str, Any]]:
        """Return a minimal, serializable view of org memberships."""
        if not self.client:
            return []
        try:
            try:
                memberships = self.client.users.get_organization_memberships(user_id=user_id)
                data = getattr(memberships, "data", [])
            except Exception:
                memberships = self.client.organization_memberships.list(user_id=[user_id])
                data = getattr(memberships, "data", [])

            out: List[Dict[str, Any]] = []
            for m in data or []:
                org = getattr(m, "organization", None)
                org_name = getattr(org, "name", "") if org else ""
                role_raw = getattr(m, "role", "") or ""
                role = str(role_raw)
                out.append(
                    {
                        "organization_name": org_name,
                        "role": role,
                        "is_progressive_reader": org_name == "ProgressiveReader",
                        "is_admin_role": role.lower() in ("admin", "org:admin"),
                    }
                )
            return out
        except Exception as exc:
            logger.error("Error listing org memberships: %s", exc)
            return []


__all__ = ["ClerkAuthProvider"]
