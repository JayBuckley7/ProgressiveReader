"""Outbound adapter: Clerk as a token provider for Google OAuth."""

from __future__ import annotations

import logging
import time
from typing import Optional, Any

try:
    from clerk_backend_api import Clerk  # type: ignore
except Exception:
    Clerk = None  # type: ignore

from ..ports import DriveProvider
from ....utils.runtime_env import is_dev_env
from ....utils.timeout import call_with_timeout, TimeoutExceededError

logger = logging.getLogger(__name__)

CLERK_TIMEOUT_SECONDS = 15.0
GOOGLE_PROVIDER_CANDIDATES = ("oauth_google", "google")


class ClerkDriveProvider(DriveProvider):
    """Google Drive provider using Clerk for OAuth token management."""

    def __init__(self, secret_key: Optional[str] = None) -> None:
        # The container is responsible for reading env/config.
        key = (secret_key or "").strip() or None
        if not key or Clerk is None:
            if is_dev_env():
                logger.debug(
                    "ClerkDriveProvider not initialized; missing secret_key or Clerk SDK (expected in development)"
                )
            else:
                logger.warning("ClerkDriveProvider not initialized; missing secret_key or Clerk SDK")
            self.client = None
        else:
            self.client = Clerk(bearer_auth=key)

    def is_configured(self) -> bool:
        return bool(self.client)

    def get_token_object(self, user_id: str) -> Optional[Any]:
        """Return the OAuth token object for the user or None."""
        if not self.client:
            logger.error("[clerk-token] Clerk client not configured")
            return None

        def _exp_to_ts(exp: object) -> Optional[float]:
            try:
                exp_ts = float(exp)
            except (TypeError, ValueError):
                return None
            # Normalize milliseconds to seconds.
            if exp_ts > 1_000_000_000_000:
                exp_ts = exp_ts / 1000.0
            return exp_ts

        tokens = None
        for provider in GOOGLE_PROVIDER_CANDIDATES:
            try:
                logger.debug(
                    "[clerk-token] Fetching google oauth token from Clerk for user_id=%s provider=%s",
                    user_id,
                    provider,
                )
                candidate_tokens = call_with_timeout(
                    label=f"Clerk oauth token fetch ({provider})",
                    timeout_seconds=CLERK_TIMEOUT_SECONDS,
                    fn=lambda provider=provider: self.client.users.get_o_auth_access_token(user_id=user_id, provider=provider),
                )
            except TimeoutExceededError:
                logger.warning(
                    "[clerk-token] Timeout fetching token from Clerk after %ss for provider=%s",
                    CLERK_TIMEOUT_SECONDS,
                    provider,
                )
                continue
            except Exception as e:
                logger.warning(
                    "[clerk-token] Failed to retrieve Google token from Clerk for provider=%s: %s",
                    provider,
                    e,
                )
                continue

            if candidate_tokens:
                logger.debug("[clerk-token] Received Google token response from provider=%s", provider)
                tokens = candidate_tokens
                break

        # The Clerk SDK typically returns a list of token objects; normalize defensively.
        if tokens is None:
            logger.warning("[clerk-token] No Google oauth tokens returned from Clerk for providers=%s", GOOGLE_PROVIDER_CANDIDATES)
            return None

        if not isinstance(tokens, list):
            try:
                tokens = list(tokens)  # type: ignore[arg-type]
            except Exception:
                logger.error("[clerk-token] Unexpected token response type: %s", type(tokens).__name__)
                return None

        if not tokens:
            logger.warning("[clerk-token] No tokens returned from Clerk (user may not have connected Google account)")
            return None

        # Prefer a token that expires in the future.
        current_time = time.time()
        for t in tokens:
            exp = getattr(t, "expires_at", None)
            if exp is None:
                continue
            exp_ts = _exp_to_ts(exp)
            if exp_ts is None:
                continue
            if exp_ts > current_time:
                return t

        logger.warning("[clerk-token] No valid future token found; returning first token")
        return tokens[0]

    def get_access_token(self, user_id: str) -> Optional[str]:
        """Get Google OAuth access token string."""
        token_obj = self.get_token_object(user_id)
        if token_obj and hasattr(token_obj, "token"):
            return token_obj.token
        return None


__all__ = ["ClerkDriveProvider"]
