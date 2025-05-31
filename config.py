"""Application configuration settings."""
import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'supersecretkey-fallback')
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
    SERVER_DEFAULT_MODEL = os.environ.get('DEFAULT_MODEL', 'gpt-4o-mini')
    UPLOAD_FOLDER = 'user_epubs'
    # Derive COVER_EXPORT_FOLDER from UPLOAD_FOLDER
    COVER_EXPORT_FOLDER = UPLOAD_FOLDER 
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
    SESSION_COOKIE_SAMESITE = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
    SESSION_COOKIE_SECURE = bool(os.environ.get('SESSION_COOKIE_SECURE', 'True'))
