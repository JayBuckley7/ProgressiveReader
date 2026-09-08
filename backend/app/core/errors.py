"""Stable application errors shared by inbound and persistence adapters."""
class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 503):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def require_identity(user_id: str | None) -> str:
    if not user_id:
        raise AppError("AUTH_REQUIRED", "Sign in to access saved records.", 401)
    return user_id
