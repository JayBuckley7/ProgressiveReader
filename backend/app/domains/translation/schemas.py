from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator
from typing import List, Optional


class TranslateRequest(BaseModel):
    content: str = Field(..., description="Chapter HTML to translate")
    target_lang: Optional[str] = Field(
        default="English",
        description="Target language (e.g., 'English', 'Japanese')"
    )
    source_lang: Optional[str] = Field(default=None, description="Optional source language")
    model: Optional[str] = Field(default="gpt-5.6-luna", description="Model name for provider")
    api_key: Optional[str] = Field(default=None, description="Optional user-provided API key")
    cefr_level: Optional[str] = Field(default=None, description="Optional CEFR level (e.g., 'B2')")
    stream: Optional[bool] = Field(default=False, description="Enable server-sent events streaming")
    use_cefr: Optional[bool] = Field(default=False, description="Include CEFR targeting in prompt")
    translation_service: Optional[str] = Field(default="openai", description="Translation provider name")


class TranslateResponse(BaseModel):
    translated_text: str
    model_used: Optional[str] = None


class TranslateSegmentRequest(BaseModel):
    """A stable reader segment to translate as part of a batch."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., min_length=1)
    html: str
    source_hash: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("source_hash", "sourceHash"),
        serialization_alias="sourceHash",
    )


class TranslateSegmentsRequest(BaseModel):
    """Translate multiple page-sized segments in one provider request."""

    model_config = ConfigDict(populate_by_name=True)

    segments: List[TranslateSegmentRequest] = Field(..., min_length=1)
    target_language: Optional[str] = Field(
        default="English",
        validation_alias=AliasChoices("target_language", "targetLanguage", "target_lang", "targetLang"),
        serialization_alias="targetLanguage",
    )
    model: Optional[str] = Field(default="gpt-5.6-luna", description="Model name for provider")
    api_key: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("api_key", "apiKey"),
        serialization_alias="apiKey",
    )
    cefr_level: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("cefr_level", "cefrLevel"),
        serialization_alias="cefrLevel",
    )
    use_cefr: Optional[bool] = Field(
        default=False,
        validation_alias=AliasChoices("use_cefr", "useCefr"),
        serialization_alias="useCefr",
    )
    prompt_version: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("prompt_version", "promptVersion"),
        serialization_alias="promptVersion",
    )
    stream: Optional[bool] = Field(default=False, description="Enable server-sent events streaming")

    @model_validator(mode="after")
    def validate_unique_segment_ids(self) -> "TranslateSegmentsRequest":
        ids = [segment.id for segment in self.segments]
        if len(ids) != len(set(ids)):
            raise ValueError("segment ids must be unique")
        return self


class TranslatedSegment(BaseModel):
    """Translated HTML paired with its stable source segment id."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    translated_html: str = Field(serialization_alias="translatedHtml")
    source_hash: Optional[str] = Field(default=None, serialization_alias="sourceHash")
    model_used: Optional[str] = Field(default=None, serialization_alias="modelUsed")


class TranslateSegmentsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    segments: List[TranslatedSegment]
    model_used: Optional[str] = Field(default=None, serialization_alias="modelUsed")


__all__ = [
    "TranslateRequest",
    "TranslateResponse",
    "TranslateSegmentRequest",
    "TranslateSegmentsRequest",
    "TranslatedSegment",
    "TranslateSegmentsResponse",
]


