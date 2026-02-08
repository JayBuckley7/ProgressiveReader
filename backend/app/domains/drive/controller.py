"""Inbound controller for Drive HTTP routes.

This keeps Flask routes thin and pushes request shaping + branching into a
non-Flask module, while still staying in the inbound adapter layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Any, Dict, List, Tuple

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

    def list_files(self, *, user_id: str, folder_id: Optional[str]) -> list[dict]:
        files = self.drive_service.list_files(user_id, folder_id)
        return [f.model_dump() for f in files]

    def upload_file(
        self,
        *,
        user_id: str,
        upload: Any,
        folder_id: Optional[str],
    ) -> Dict[str, Any]:
        if upload is None:
            raise ValueError("Missing file")
        filename = getattr(upload, "filename", None)
        if not filename:
            raise ValueError("Missing filename")
        mimetype = getattr(upload, "mimetype", None) or "application/octet-stream"
        file_content = upload.read()
        return self.drive_service.upload_file(
            user_id=user_id,
            file_content=file_content,
            filename=filename,
            mimetype=mimetype,
            folder_id=folder_id,
        )

    def download_file(self, *, user_id: str, file_id: str) -> Tuple[bytes, str]:
        return self.drive_service.download_file(user_id, file_id)

    def get_thumbnail(self, *, user_id: str, file_id: str, size: int) -> Tuple[bytes | None, str | None]:
        return self.drive_service.get_thumbnail(user_id, file_id, size=size)

    def delete_file(self, *, user_id: str, file_id: str) -> bool:
        return self.drive_service.delete_file(user_id, file_id)


__all__ = ["DriveController", "clamp_thumbnail_size"]
