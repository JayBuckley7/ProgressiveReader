from __future__ import annotations

from app.domains.ocr.layout_service import OcrLayoutService


class FakeExtractor:
    def __init__(self):
        self.calls = 0

    def extract_page_layout(self, image_bytes: bytes, *, ocr_profile: str) -> dict:
        self.calls += 1
        return {
            "image": {"width": 100, "height": 200},
            "lines": [
                {
                    "id": "line-0",
                    "text": "日本語",
                    "order": 0,
                    "direction": "vertical",
                    "confidence": 0.9,
                    "bboxNorm": {"x": 0.1, "y": 0.2, "width": 0.2, "height": 0.5},
                    "polygonNorm": [],
                    "atomIds": ["atom-0"],
                }
            ],
            "atoms": [
                {
                    "id": "atom-0",
                    "text": "日本語",
                    "lineId": "line-0",
                    "order": 0,
                    "direction": "vertical",
                    "confidence": 0.9,
                    "bboxNorm": {"x": 0.1, "y": 0.2, "width": 0.2, "height": 0.5},
                    "polygonNorm": [],
                }
            ],
        }


class ProfileResolvingExtractor(FakeExtractor):
    def resolve_ocr_profile(self, ocr_profile: str) -> str:
        return "resolved-profile"


class FakeRepo:
    def __init__(self, cached: dict | None = None):
        self.cached = cached
        self.saved: dict | None = None

    def get(self, *, content_hash: str, ocr_profile: str) -> dict | None:
        return self.cached

    def save(self, **kwargs) -> dict:
        self.saved = kwargs
        return kwargs["layout"]


def test_layout_service_returns_cached_layout_without_extractor():
    cached = {
        "image": {"width": 111, "height": 222},
        "lines": [],
        "atoms": [],
    }
    extractor = FakeExtractor()
    repo = FakeRepo(cached=cached)
    service = OcrLayoutService(extractor=extractor, cache_repo=repo)

    result = service.extract_or_get_cached(
        image_bytes=b"img",
        ocr_profile="ja-pdf-overlay-v1",
        page_index=0,
        document_id="book-1",
        document_version="v1",
    )

    assert result.cacheHit is True
    assert result.image.width == 111
    assert extractor.calls == 0
    assert repo.saved is None


def test_layout_service_extracts_and_saves_on_cache_miss():
    extractor = FakeExtractor()
    repo = FakeRepo(cached=None)
    service = OcrLayoutService(extractor=extractor, cache_repo=repo)

    result = service.extract_or_get_cached(
        image_bytes=b"img",
        ocr_profile="ja-pdf-overlay-v1",
        page_index=3,
        document_id="book-2",
        document_version="v2",
    )

    assert result.cacheHit is False
    assert result.pageIndex == 3
    assert extractor.calls == 1
    assert repo.saved is not None
    assert repo.saved["page_index"] == 3


def test_layout_service_uses_extractor_resolved_profile_for_cache_key_and_response():
    extractor = ProfileResolvingExtractor()
    repo = FakeRepo(cached=None)
    service = OcrLayoutService(extractor=extractor, cache_repo=repo)

    result = service.extract_or_get_cached(
        image_bytes=b"img",
        ocr_profile="requested-profile",
        page_index=0,
        document_id=None,
        document_version=None,
    )

    assert result.ocrProfile == "resolved-profile"
    assert repo.saved is not None
    assert repo.saved["ocr_profile"] == "resolved-profile"
