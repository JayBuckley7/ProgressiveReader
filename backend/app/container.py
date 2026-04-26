"""Application composition root (dependency wiring).

Hexagonal rule of thumb:
- Domains define ports + use-cases (services).
- Adapters implement ports (OpenAI, DB, HTTP, etc).
- The container wires concrete adapters to services.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging

from typing import Callable, Any

from .adapters.llm_api_key_resolver import DefaultApiKeyResolver
from .adapters.memory_key_pool import InMemoryApiKeyPool
from .core.llm_keys import ApiKeyPoolPort, ApiKeyResolverPort
from .settings import AppSettings
from .domains.translation.service import TranslationService
from .domains.translation.adapters.openai import OpenAIProvider as OpenAITranslationProvider
from .domains.grammar.service import GrammarService
from .domains.grammar.adapters.openai import OpenAIProvider as OpenAIGrammarProvider
from .domains.mix.service import MixService
from .domains.mix.adapters.openai import OpenAIJsonChatProvider
from .domains.auth.service import AuthService
from .domains.auth.adapters.clerk import ClerkAuthProvider
from .domains.drive.adapters.clerk import ClerkDriveProvider
from .domains.drive.adapters.google_drive import GoogleDriveIntegration
from .domains.drive.service import DriveService
from .domains.books.service import BooksService
from .domains.admin.service import AdminService
from .domains.books.adapters.sqlalchemy_repository import SqlAlchemyBooksRepository
from .domains.books.adapters.cover_lookup import PublicApiCoverLookup
from .domains.books.adapters.local_demo_storage import LocalDemoStorageProvider
from .domains.vocabulary.service import VocabularyService
from .domains.vocabulary.adapters.sqlalchemy_repository import SqlAlchemyVocabularyRepository
from .domains.vocabulary.adapters.jpdb_module import JpdbModuleProvider
from .domains.vocabulary.adapters.jpdb_http import JpdbHttpProvider
from .domains.kanji.service import KanjiService
from .domains.kanji.adapters.json_file_repository import JsonFileKanjiRepository
from .domains.ocr.service import OCRService
from .domains.ocr.layout_service import OcrLayoutService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Container:
    openai_key_resolver: ApiKeyResolverPort
    make_translation_service: Callable[[str], TranslationService]
    make_grammar_service: Callable[[str], GrammarService]
    make_mix_service: Callable[[str], MixService]
    auth_service: AuthService
    admin_service: AdminService
    clerk_secret_key: str | None
    drive_service: DriveService
    books_service: BooksService
    vocabulary_service: VocabularyService
    make_kanji_service: Callable[[], KanjiService]
    ocr_service: OCRService | None
    ocr_layout_service: OcrLayoutService | None
    ocr_init_error: str | None


def create_container(*, settings: AppSettings, db_session: Any) -> Container:
    openai_key_pool = InMemoryApiKeyPool()
    for key in settings.openai_pool_keys:
        openai_key_pool.add_key(key)

    openai_key_resolver = DefaultApiKeyResolver(pool=openai_key_pool, fallback_key=settings.openai_fallback_key)

    def make_translation_service(api_key: str) -> TranslationService:
        return TranslationService(OpenAITranslationProvider(api_key=api_key))

    def make_grammar_service(api_key: str) -> GrammarService:
        return GrammarService(OpenAIGrammarProvider(api_key=api_key))

    def make_mix_service(api_key: str) -> MixService:
        return MixService(OpenAIJsonChatProvider(api_key=api_key))

    auth_provider = ClerkAuthProvider(secret_key=settings.clerk_secret_key)
    auth_service = AuthService(auth_provider)
    admin_service = AdminService(openai_key_pool, auth_provider, fallback_key=settings.openai_fallback_key)

    drive_provider = ClerkDriveProvider(secret_key=settings.clerk_secret_key)
    drive_service = DriveService(GoogleDriveIntegration(drive_provider))

    books_service = BooksService(
        SqlAlchemyBooksRepository(db_session),
        LocalDemoStorageProvider(None),
        PublicApiCoverLookup(google_books_api_key=settings.google_books_api_key),
    )
    vocabulary_service = VocabularyService(
        JpdbModuleProvider(deck_id=settings.jpdb_deck_id),
        settings.jpdb_config,
        JpdbHttpProvider(),
        SqlAlchemyVocabularyRepository(db_session),
    )

    def make_kanji_service() -> KanjiService:
        return KanjiService(JsonFileKanjiRepository(settings.kanji_data_path))

    # Optional: OCR dependencies may not be installed in all environments.
    ocr_service = None
    ocr_layout_service = None
    ocr_init_error = None
    try:
        from .domains.ocr.adapters.google_vision import GoogleVisionOcrProcessor
        from .domains.ocr.adapters.google_vision_layout import GoogleVisionOcrLayoutExtractor
        from .domains.ocr.adapters.hybrid_layout import HybridOcrLayoutExtractor
        from .domains.ocr.adapters.sqlalchemy_layout_cache import SqlAlchemyOcrLayoutCacheRepository

        ocr_service = OCRService(GoogleVisionOcrProcessor(credentials_json=settings.ocr_credentials_json))
        base_layout_extractor = GoogleVisionOcrLayoutExtractor(credentials_json=settings.ocr_credentials_json)
        layout_refiner = None
        if settings.ocr_gemini_api_key:
            from .domains.ocr.adapters.gemini_layout_refiner import GeminiOcrLayoutRefiner

            layout_refiner = GeminiOcrLayoutRefiner(
                api_key=settings.ocr_gemini_api_key,
                model=settings.ocr_gemini_model,
            )
        ocr_layout_service = OcrLayoutService(
            extractor=HybridOcrLayoutExtractor(base=base_layout_extractor, refiner=layout_refiner),
            cache_repo=SqlAlchemyOcrLayoutCacheRepository(db_session),
        )
    except Exception as e:  # pragma: no cover - depends on optional vendor deps
        ocr_service = None
        ocr_layout_service = None
        ocr_init_error = str(e)

    return Container(
        openai_key_resolver=openai_key_resolver,
        make_translation_service=make_translation_service,
        make_grammar_service=make_grammar_service,
        make_mix_service=make_mix_service,
        auth_service=auth_service,
        admin_service=admin_service,
        clerk_secret_key=settings.clerk_secret_key,
        drive_service=drive_service,
        books_service=books_service,
        vocabulary_service=vocabulary_service,
        make_kanji_service=make_kanji_service,
        ocr_service=ocr_service,
        ocr_layout_service=ocr_layout_service,
        ocr_init_error=ocr_init_error,
    )


__all__ = ["Container", "create_container"]
