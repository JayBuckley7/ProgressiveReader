from __future__ import annotations

from app.domains.ocr.adapters.gemini_layout_refiner import GeminiOcrLayoutRefiner
from app.domains.ocr.adapters.hybrid_layout import HybridOcrLayoutExtractor


class FakeBaseExtractor:
    def __init__(self):
        self.calls = 0

    def extract_page_layout(self, image_bytes: bytes, *, ocr_profile: str) -> dict:
        self.calls += 1
        return {
            "image": {"width": 100, "height": 200},
            "lines": [
                {
                    "id": "line-0",
                    "text": "bad",
                    "atomIds": ["atom-0"],
                }
            ],
            "atoms": [
                {
                    "id": "atom-0",
                    "text": "bad",
                    "lineId": "line-0",
                }
            ],
        }


class FakeRefiner:
    def __init__(self):
        self.calls = 0

    def refine_page_layout(self, image_bytes: bytes, *, layout: dict, ocr_profile: str) -> dict:
        self.calls += 1
        refined = dict(layout)
        refined["lines"] = [{**layout["lines"][0], "text": "good"}]
        refined["atoms"] = [{**layout["atoms"][0], "text": "good"}]
        return refined


def test_hybrid_extractor_refines_only_hybrid_profiles():
    base = FakeBaseExtractor()
    refiner = FakeRefiner()
    extractor = HybridOcrLayoutExtractor(base=base, refiner=refiner)

    baseline = extractor.extract_page_layout(b"img", ocr_profile="ja-pdf-overlay-v1")
    hybrid = extractor.extract_page_layout(b"img", ocr_profile="ja-pdf-overlay-hybrid-v1")

    assert baseline["lines"][0]["text"] == "bad"
    assert hybrid["lines"][0]["text"] == "good"
    assert base.calls == 2
    assert refiner.calls == 1


def test_hybrid_extractor_downgrades_profile_without_refiner():
    extractor = HybridOcrLayoutExtractor(base=FakeBaseExtractor(), refiner=None)

    assert extractor.resolve_ocr_profile("ja-pdf-overlay-hybrid-v1") == "ja-pdf-overlay-v1"


def test_gemini_refiner_applies_only_known_id_text_corrections():
    layout = {
        "image": {"width": 100, "height": 200},
        "lines": [
            {
                "id": "line-0",
                "text": "bad",
                "atomIds": ["atom-0"],
            }
        ],
        "atoms": [
            {
                "id": "atom-0",
                "text": "bad",
                "lineId": "line-0",
            }
        ],
    }

    refined = GeminiOcrLayoutRefiner._apply_corrections(
        layout,
        {
            "lines": [{"id": "line-0", "text": "義経"}],
            "atoms": [{"id": "atom-0", "text": "義経"}, {"id": "missing", "text": "ignored"}],
        },
    )

    assert refined["lines"][0]["text"] == "義経"
    assert refined["atoms"][0]["text"] == "義経"
    assert layout["lines"][0]["text"] == "bad"
