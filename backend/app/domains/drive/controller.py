"""Inbound controller for Drive HTTP routes.

This keeps Flask routes thin and pushes request shaping + branching into a
non-Flask module, while still staying in the inbound adapter layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .errors import DriveProviderNotConfiguredError, GoogleNotConnectedError
from .schemas import HealthResponse, TokenResponse
from .service import DriveService


def clamp_thumbnail_size(size_raw: Optional[str]) -> int:
    try:
        size = int(size_raw) if size_raw else 420
        return max(64, min(size, 1024))
    except Exception:
        return 420


@dataclass(frozen=True)
class DriveController:
    drive_service: DriveService
    clerk_secret_key: str | None

    def health(self) -> HealthResponse:
        return HealthResponse(
            clerk_secret_key_configured=bool(self.clerk_secret_key),
            clerk_client_initialized=bool(self.drive_service.is_provider_configured()),
            service="drive",
        )

    def get_token(self, *, user_id: str) -> TokenResponse:
        if not self.drive_service.is_provider_configured():
            raise DriveProviderNotConfiguredError("Clerk client not configured")

        try:
            token_info = self.drive_service.get_access_token_info(user_id)
        except ValueError as e:
            msg = str(e)
            if "No Google token" in msg or "token" in msg.lower():
                raise GoogleNotConnectedError("Google account not connected") from e
            raise

        return TokenResponse(**token_info)


__all__ = ["DriveController", "clamp_thumbnail_size"]

