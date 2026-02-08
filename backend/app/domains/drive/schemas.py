"""Pydantic schemas for Drive domain."""
from pydantic import BaseModel
from typing import Optional, Dict, Any


class DriveFile(BaseModel):
    """Drive file representation."""
    id: str
    name: str
    mimeType: Optional[str] = None
    modifiedTime: Optional[str] = None
    size: Optional[str] = None
    webViewLink: Optional[str] = None
    iconLink: Optional[str] = None
    thumbnailLink: Optional[str] = None
    hasThumbnail: Optional[bool] = None


class ListFilesRequest(BaseModel):
    """Request schema for listing files."""
    folderId: Optional[str] = None


class UploadFileRequest(BaseModel):
    """Request schema for uploading files."""
    folderId: Optional[str] = None
    filename: str
    mimetype: str


class TokenResponse(BaseModel):
    """Response schema for token endpoint."""
    access_token: str
    expires_in: int


class HealthResponse(BaseModel):
    """Response schema for health check."""
    clerk_secret_key_configured: bool
    clerk_client_initialized: bool
    service: str
