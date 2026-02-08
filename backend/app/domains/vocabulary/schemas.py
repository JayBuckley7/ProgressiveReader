from pydantic import BaseModel, Field
from typing import Optional, List, Literal, Any


class DueCard(BaseModel):
    id: str
    term: str
    meaning: str


class Deck(BaseModel):
    id: str
    name: str
    words: Optional[int] = None


class ListUserDecksRequest(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    cookie: Optional[str] = None


class GetJpdbDataRequest(BaseModel):
    text_segments: List[str] = Field(..., description="Raw text segment list")
    jpdb_api_key: str = Field(..., description="Bearer token for JPDB API")


class Ruby(BaseModel):
    text: str
    start: int
    length: int
    end: int


class ProcessedToken(BaseModel):
    start: int
    length: int
    end: int
    card: dict
    rubies: List[Ruby] = []


class MineWordRequest(BaseModel):
    vid: int
    sid: int
    jpdb_api_key: str
    mining_deck_id: Optional[int] = None
    # Optional helpers for richer clients (web/kmp). These are ignored by older callers.
    forq: Optional[bool] = None
    forq_deck_id: Optional[int] = None
    sentence: Optional[str] = None


Flag = Literal['blacklist', 'never-forget', 'forq']


class UpdateWordStateRequest(BaseModel):
    vid: int
    sid: int
    flag: Flag
    state: Any
    jpdb_api_key: str
    # Optional deck ids for clients that manage per-user deck configuration.
    # For `blacklist` / `never-forget`, JPDB also supports using special deck ids
    # ("blacklist", "never-forget") directly; those don't require numeric ids.
    blacklist_deck_id: Optional[int] = None
    never_forget_deck_id: Optional[int] = None
    forq_deck_id: Optional[int] = None


AllowedRating = Literal[
    'nothing', 'something', 'hard', 'good', 'easy',
    'pass', 'fail', 'known', 'unknown'
]


class ReviewCardRequest(BaseModel):
    vid: int
    sid: int
    rating: AllowedRating
    jpdb_api_key: str


class AddVocabularyWordRequest(BaseModel):
    word: str = Field(..., description="Vocabulary word to add")
    translation: str = Field(..., description="Translation of the word")
    language: str = Field(default="English", description="Language of the word")
    bookId: Optional[str] = Field(default=None, description="Optional book ID")
    context: Optional[str] = Field(default=None, description="Optional context sentence")
    difficulty: Optional[str] = Field(default=None, description="Optional difficulty level")


class AddVocabularyWordResponse(BaseModel):
    success: bool
    id: str
    word: str
    translation: str
    language: str


class Vocabulary(BaseModel):
    """Vocabulary word schema."""
    id: str
    word: str
    translation: str
    language: str
    bookId: Optional[str] = None
    context: Optional[str] = None
    difficulty: Optional[str] = None
    mastered: bool = False
    createdAt: Optional[str] = None


class ToggleMasteredRequest(BaseModel):
    """Request schema for toggling mastered status."""
    mastered: bool = Field(..., description="Whether the word is mastered")


class VocabularyListResponse(BaseModel):
    """Response schema for vocabulary list."""
    vocabulary: List[Vocabulary]


class FetchDueCardsGoogleOAuthRequest(BaseModel):
    """Request schema for fetching due cards with Google OAuth."""
    offset: int = 0
