import os

class Config:
    SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'supersecretkey-fallback')
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
    SERVER_DEFAULT_MODEL = os.environ.get('DEFAULT_MODEL', 'gpt-4o-mini')
    UPLOAD_FOLDER = 'user_epubs'
    # Derive COVER_EXPORT_FOLDER from UPLOAD_FOLDER
    COVER_EXPORT_FOLDER = UPLOAD_FOLDER 
    ALLOWED_EXTENSIONS = {'epub'}
    # JPDB API Limits (can be configured here)
    MAX_BYTES_PER_API_BATCH = 15000 
    MAX_SEGMENTS_PER_API_BATCH = 75
    JPDB_TOKEN_FIELDS = ['vocabulary_index', 'position', 'length', 'furigana']
    JPDB_VOCAB_FIELDS = ['vid', 'sid', 'card_state']
    JPDB_API_URL = 'https://jpdb.io/api/v1/parse' 