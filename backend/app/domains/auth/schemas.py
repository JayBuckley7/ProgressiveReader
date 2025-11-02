from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, Dict, Any


class SessionInfo(BaseModel):
    user_id: str
    session_id: str
    status: Optional[str] = None


class UserInfo(BaseModel):
    id: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    image_url: Optional[str] = None


class SettingsResponse(BaseModel):
    """Response schema for settings."""
    settings: Dict[str, Any]


class SaveSettingsRequest(BaseModel):
    """Request schema for saving settings."""
    settings: Dict[str, Any]


class SaveSettingsResponse(BaseModel):
    """Response schema for saving settings."""
    success: bool

