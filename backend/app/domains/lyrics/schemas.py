from pydantic import BaseModel, Field


class ImportLyricsRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class ImportedLyrics(BaseModel):
    title: str
    artist: str
    text: str
    source_url: str


__all__ = ["ImportLyricsRequest", "ImportedLyrics"]
