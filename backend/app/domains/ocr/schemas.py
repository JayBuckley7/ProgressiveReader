"""OCR domain schemas."""
from pydantic import BaseModel


class OCRProcessResponse(BaseModel):
    """Response schema for OCR processing."""
    success: bool
    message: str

