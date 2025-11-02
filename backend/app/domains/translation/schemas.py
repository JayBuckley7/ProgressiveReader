from pydantic import BaseModel, Field
from typing import Optional


class TranslateRequest(BaseModel):
    content: str = Field(..., description="Chapter HTML to translate")
    target_lang: Optional[str] = Field(
        default="English",
        description="Target language (e.g., 'English', 'Japanese')"
    )
    source_lang: Optional[str] = Field(default=None, description="Optional source language")
    model: Optional[str] = Field(default="gpt-4o-mini", description="Model name for provider")
    api_key: Optional[str] = Field(default=None, description="Optional user-provided API key")
    cefr_level: Optional[str] = Field(default=None, description="Optional CEFR level (e.g., 'B2')")
    stream: Optional[bool] = Field(default=False, description="Enable server-sent events streaming")
    use_cefr: Optional[bool] = Field(default=False, description="Include CEFR targeting in prompt")
    translation_service: Optional[str] = Field(default="openai", description="Translation provider name")


class TranslateResponse(BaseModel):
    translated_text: str
    model_used: Optional[str] = None


__all__ = [
    "TranslateRequest",
    "TranslateResponse",
]


