"""Application settings loader.

This is intentionally the only place that translates env/config into typed
settings used by the composition root (container).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional
import json
import logging

from .utils.runtime_env import is_dev_env
from .domains.vocabulary.config import JpdbConfig

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AppSettings:
    # OpenAI
    openai_fallback_key: str | None
    openai_pool_keys: list[str]

    # Clerk
    clerk_secret_key: str | None

    # Google Books cover lookup
    google_books_api_key: str | None

    # JPDB legacy scraping
    jpdb_deck_id: str | None

    # JPDB API settings
    jpdb_config: JpdbConfig

    # Kanji data
    kanji_data_path: str

    # OCR (Vision)
    ocr_credentials_json: str | None


def _get_str(flask_config: Mapping[str, Any] | None, env: Mapping[str, str], key: str) -> str | None:
    # Prefer flask_config for app-provided values, fall back to env.
    if flask_config is not None:
        v = flask_config.get(key)
        if v is not None:
            s = str(v).strip()
            if s:
                return s
    s2 = str(env.get(key, "")).strip()
    return s2 or None


def load_settings(*, env: Mapping[str, str], flask_config: Mapping[str, Any] | None = None) -> AppSettings:
    openai_fallback_key = _get_str(flask_config, env, "OPENAI_API_KEY")

    openai_pool_keys: list[str] = []
    openai_keys_json = env.get("OPENAI_API_KEYS")
    if openai_keys_json:
        try:
            parsed = json.loads(openai_keys_json)
            if isinstance(parsed, list):
                for key in parsed:
                    if isinstance(key, str) and key.strip():
                        openai_pool_keys.append(key.strip())
        except Exception:
            # Do not fail app startup for key parsing issues.
            pass

    clerk_secret_key = _get_str(flask_config, env, "CLERK_SECRET_KEY")

    # Cover lookup keys
    google_books_api_key = _get_str(flask_config, env, "GOOGLE_BOOKS_API_KEY") or _get_str(flask_config, env, "GAPI_KEY")
    if not google_books_api_key:
        legacy = _get_str(flask_config, env, "VITE_GAPI_KEY")
        if legacy:
            if is_dev_env():
                logger.warning(
                    "Using deprecated env var VITE_GAPI_KEY for Google Books cover lookup. "
                    "Set GOOGLE_BOOKS_API_KEY (preferred) or GAPI_KEY instead."
                )
            google_books_api_key = legacy

    # JPDB scraping deck id (legacy path)
    jpdb_deck_id = _get_str(flask_config, env, "JPDB_DECK_ID")

    jpdb_config = JpdbConfig(
        max_bytes_per_api_batch=int(
            (flask_config.get("MAX_BYTES_PER_API_BATCH") if flask_config else 15000)  # type: ignore[arg-type]
            or 15000
        ),
        max_segments_per_api_batch=int(
            (flask_config.get("MAX_SEGMENTS_PER_API_BATCH") if flask_config else 75)  # type: ignore[arg-type]
            or 75
        ),
        token_fields=list(
            (flask_config.get("JPDB_TOKEN_FIELDS") if flask_config else ["vocabulary_index", "position", "length", "furigana"])  # type: ignore[arg-type]
            or ["vocabulary_index", "position", "length", "furigana"]
        ),
        vocab_fields=list(
            (
                flask_config.get("JPDB_VOCAB_FIELDS")  # type: ignore[arg-type]
                if flask_config
                else [
                    "vid",
                    "sid",
                    "rid",
                    "spelling",
                    "reading",
                    "frequency_rank",
                    "part_of_speech",
                    "meanings_chunks",
                    "meanings_part_of_speech",
                    "card_state",
                    "pitch_accent",
                ]
            )
            or [
                "vid",
                "sid",
                "rid",
                "spelling",
                "reading",
                "frequency_rank",
                "part_of_speech",
                "meanings_chunks",
                "meanings_part_of_speech",
                "card_state",
                "pitch_accent",
            ]
        ),
        api_url=str(
            (flask_config.get("JPDB_API_URL") if flask_config else "https://jpdb.io/api/v1/parse")  # type: ignore[arg-type]
            or "https://jpdb.io/api/v1/parse"
        ),
        review_url=str(
            (flask_config.get("JPDB_REVIEW_URL") if flask_config else "https://jpdb.io/api/v1/review")  # type: ignore[arg-type]
            or "https://jpdb.io/api/v1/review"
        ),
    )

    # Kanji data default path (project-relative).
    project_root = Path(__file__).resolve().parents[2]
    default_kanji_path = project_root / "frontend" / "src" / "data" / "jlpt" / "kanjiapi_full.json"
    kanji_data_path = _get_str(flask_config, env, "KANJI_DATA_PATH") or str(default_kanji_path)

    ocr_credentials_json = _get_str(flask_config, env, "GOOGLE_APPLICATION_CREDENTIALS_JSON")

    return AppSettings(
        openai_fallback_key=openai_fallback_key,
        openai_pool_keys=openai_pool_keys,
        clerk_secret_key=clerk_secret_key,
        google_books_api_key=google_books_api_key,
        jpdb_deck_id=jpdb_deck_id,
        jpdb_config=jpdb_config,
        kanji_data_path=kanji_data_path,
        ocr_credentials_json=ocr_credentials_json,
    )


__all__ = ["AppSettings", "load_settings"]

