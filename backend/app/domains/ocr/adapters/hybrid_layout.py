"""Hybrid OCR extractor that refines deterministic OCR geometry with an LLM."""

from __future__ import annotations

from ..ports import OcrLayoutExtractorPort, OcrLayoutRefinerPort


class HybridOcrLayoutExtractor(OcrLayoutExtractorPort):
    """Run a base OCR extractor, then optionally refine text for hybrid profiles."""

    def __init__(self, *, base: OcrLayoutExtractorPort, refiner: OcrLayoutRefinerPort | None) -> None:
        self._base = base
        self._refiner = refiner

    def resolve_ocr_profile(self, ocr_profile: str) -> str:
        if self._refiner is None and "hybrid" in ocr_profile:
            return ocr_profile.replace("-hybrid", "")
        return ocr_profile

    def extract_page_layout(self, image_bytes: bytes, *, ocr_profile: str) -> dict:
        ocr_profile = self.resolve_ocr_profile(ocr_profile)
        layout = self._base.extract_page_layout(image_bytes, ocr_profile=ocr_profile)
        if self._refiner is None or "hybrid" not in ocr_profile:
            return layout
        return self._refiner.refine_page_layout(image_bytes, layout=layout, ocr_profile=ocr_profile)
