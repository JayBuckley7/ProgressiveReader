"""Google Vision page-image OCR extractor for normalized overlay layouts."""

from __future__ import annotations

import json
import time
from typing import Any

from ..ports import OcrLayoutExtractorPort

try:
    from google.cloud import vision
    from google.oauth2 import service_account
except ImportError:  # pragma: no cover - optional dependency
    vision = None
    service_account = None

class GoogleVisionOcrLayoutExtractor(OcrLayoutExtractorPort):
    def __init__(self, *, credentials_json: str | None = None) -> None:
        if vision is None or service_account is None:
            raise ImportError("google-cloud-vision is not installed")
        self._credentials_json = credentials_json
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client

        creds_json_str = self._credentials_json
        if creds_json_str:
            creds_info = json.loads(creds_json_str)
            creds = service_account.Credentials.from_service_account_info(creds_info)
            self._client = vision.ImageAnnotatorClient(credentials=creds)
        else:
            self._client = vision.ImageAnnotatorClient()
        return self._client

    @staticmethod
    def _is_transient_vision_error(error: Exception) -> bool:
        text = str(error).lower()
        return any(
            marker in text
            for marker in (
                "503",
                "unavailable",
                "goaway",
                "session_timed_out",
                "deadline exceeded",
                "temporarily unavailable",
            )
        )

    @staticmethod
    def _norm_point(vertex: Any, width: int, height: int) -> dict:
        x = max(0.0, min(1.0, float(getattr(vertex, "x", 0) or 0) / max(width, 1)))
        y = max(0.0, min(1.0, float(getattr(vertex, "y", 0) or 0) / max(height, 1)))
        return {"x": x, "y": y}

    @classmethod
    def _polygon_and_box(cls, vertices: list[Any], width: int, height: int) -> tuple[list[dict], dict]:
        polygon = [cls._norm_point(v, width, height) for v in vertices]
        xs = [p["x"] for p in polygon] or [0.0]
        ys = [p["y"] for p in polygon] or [0.0]
        box = {
            "x": min(xs),
            "y": min(ys),
            "width": max(xs) - min(xs),
            "height": max(ys) - min(ys),
        }
        return polygon, box

    @staticmethod
    def _paragraph_direction(vertices: list[Any]) -> str:
        xs = [float(getattr(v, "x", 0) or 0) for v in vertices]
        ys = [float(getattr(v, "y", 0) or 0) for v in vertices]
        width = (max(xs) - min(xs)) if xs else 0.0
        height = (max(ys) - min(ys)) if ys else 0.0
        return "vertical" if width <= 0 or (height / max(width, 1.0)) >= 1.45 else "horizontal"

    def extract_page_layout(self, image_bytes: bytes, *, ocr_profile: str) -> dict:
        _ = ocr_profile
        last_error: Exception | None = None
        for attempt in range(2):
            client = self._get_client()
            try:
                response = client.document_text_detection(image=vision.Image(content=image_bytes))
                break
            except Exception as error:
                last_error = error
                if attempt >= 1 or not self._is_transient_vision_error(error):
                    raise
                self._client = None
                time.sleep(0.4)
        else:  # pragma: no cover - defensive; loop either breaks or raises.
            raise last_error or RuntimeError("Google Vision OCR failed")

        if response.error.code != 0:
            raise RuntimeError(f"Error in OCR: {response.error.message}")

        full_text = getattr(response, "full_text_annotation", None)
        pages = getattr(full_text, "pages", None) or []
        if not pages:
            return {
                "image": {"width": 0, "height": 0},
                "lines": [],
                "atoms": [],
            }

        page = pages[0]
        width = int(getattr(page, "width", 0) or 0)
        height = int(getattr(page, "height", 0) or 0)
        lines: list[dict] = []
        atoms: list[dict] = []
        line_order = 0
        atom_order = 0

        for block in getattr(page, "blocks", []) or []:
            for paragraph in getattr(block, "paragraphs", []) or []:
                words = getattr(paragraph, "words", []) or []
                if not words:
                    continue

                para_vertices = list(getattr(getattr(paragraph, "bounding_box", None), "vertices", None) or [])
                para_polygon, para_box = self._polygon_and_box(para_vertices, width, height)
                direction = self._paragraph_direction(para_vertices)
                line_id = f"line-{line_order}"
                atom_ids: list[str] = []
                parts: list[str] = []
                confidences: list[float] = []

                for word in words:
                    word_vertices = list(getattr(getattr(word, "bounding_box", None), "vertices", None) or [])
                    polygon, box = self._polygon_and_box(word_vertices, width, height)
                    text = "".join(str(getattr(symbol, "text", "") or "") for symbol in getattr(word, "symbols", []) or [])
                    if not text:
                        continue

                    atom_id = f"atom-{atom_order}"
                    atom_order += 1
                    confidence = float(getattr(word, "confidence", 0.0) or 0.0)
                    confidences.append(confidence)
                    atom_ids.append(atom_id)
                    parts.append(text)
                    atoms.append(
                        {
                            "id": atom_id,
                            "text": text,
                            "lineId": line_id,
                            "order": len(atom_ids) - 1,
                            "direction": direction,
                            "confidence": confidence,
                            "bboxNorm": box,
                            "polygonNorm": polygon,
                        }
                    )

                text = "".join(parts).strip()
                if not atom_ids or not text:
                    continue

                lines.append(
                    {
                        "id": line_id,
                        "text": text,
                        "order": line_order,
                        "direction": direction,
                        "confidence": sum(confidences) / max(len(confidences), 1),
                        "bboxNorm": para_box,
                        "polygonNorm": para_polygon,
                        "atomIds": atom_ids,
                    }
                )
                line_order += 1

        return {
            "image": {"width": width, "height": height},
            "lines": lines,
            "atoms": atoms,
        }
