"""Application configuration settings."""
import os

class Config:
    ALLOWED_EXTENSIONS = {'epub', 'txt', 'docx', 'pdf', 'mobi'}
    # JPDB API Limits (can be configured here)
    MAX_BYTES_PER_API_BATCH = 15000 
    MAX_SEGMENTS_PER_API_BATCH = 75
    JPDB_TOKEN_FIELDS = ['vocabulary_index', 'position', 'length', 'furigana']
    JPDB_VOCAB_FIELDS = [
        'vid',
        'sid',
        'rid',
        'spelling',
        'reading',
        'frequency_rank',
        'part_of_speech',
        'meanings_chunks',
        'meanings_part_of_speech',
        'card_state',
        'pitch_accent',
    ]
    JPDB_API_URL = 'https://jpdb.io/api/v1/parse'
    JPDB_REVIEW_URL = 'https://jpdb.io/api/v1/review'
    
    # Google Cloud Translation API
    GOOGLE_TRANSLATE_API_KEY = os.environ.get('GOOGLE_TRANSLATE_API_KEY')
    GOOGLE_TRANSLATE_API_URL = 'https://translation.googleapis.com/language/translate/v2'
    
    # Allow large files (for dictionary files like jitendex-yomitan.zip)
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB max file size
    
    SESSION_COOKIE_SAMESITE = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "True").lower() in (
        "true",
        "1",
        "yes",
    )
