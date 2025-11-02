"""Admin domain schemas."""
from pydantic import BaseModel
from typing import List, Optional


class AddOpenAIKeyRequest(BaseModel):
    """Request to add an OpenAI API key."""
    key: str


class RemoveOpenAIKeyRequest(BaseModel):
    """Request to remove an OpenAI API key."""
    key: str


class AdminStatusResponse(BaseModel):
    """Response for admin status check."""
    user_id: str
    is_admin: bool
    memberships: List[dict]
    error: Optional[str] = None


class OpenAIKeyStatusResponse(BaseModel):
    """Response for OpenAI key configuration status."""
    openai_key_configured: bool
    pool_size: int


class OpenAIKeyListResponse(BaseModel):
    """Response for listing OpenAI keys."""
    keys: List[str]


class OpenAIKeyOperationResponse(BaseModel):
    """Response for key add/remove operations."""
    success: bool
    pool_size: int

