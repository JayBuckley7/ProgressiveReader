"""Gemini-based OCR text refiner for manga-style page overlays."""

from __future__ import annotations

import base64
import copy
import json
import logging
from typing import Any

import requests

from ..ports import OcrLayoutRefinerPort

logger = logging.getLogger(__name__)


class GeminiOcrLayoutRefiner(OcrLayoutRefinerPort):
    """Correct OCR text while preserving Vision-provided geometry and IDs."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "gemini-2.5-flash",
        timeout_seconds: int = 20,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout_seconds = timeout_seconds

    def refine_page_layout(self, image_bytes: bytes, *, layout: dict, ocr_profile: str) -> dict:
        if not layout.get("lines") or not layout.get("atoms"):
            return layout

        try:
            corrections = self._request_corrections(image_bytes, layout=layout, ocr_profile=ocr_profile)
            return self._apply_corrections(layout, corrections)
        except Exception as exc:
            logger.warning("Gemini OCR refinement failed; using base OCR layout: %s", exc, exc_info=True)
            return layout

    def _request_corrections(self, image_bytes: bytes, *, layout: dict, ocr_profile: str) -> dict:
        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self._model}:generateContent?key={self._api_key}"
        )
        prompt = {
            "task": "Correct Japanese manga OCR text while preserving geometry.",
            "rules": [
                "Return only JSON.",
                "Only use existing atom IDs and line IDs from the OCR layout.",
                "Do not create new boxes or IDs.",
                "Correct obvious OCR mistakes in Japanese text, including vertical manga text.",
                "If unsure, keep the original text.",
                "For each changed atom, return its existing id and corrected text.",
                "For each changed line, return its existing id and corrected full text.",
            ],
            "response_schema": {
                "atoms": [{"id": "atom-0", "text": "corrected atom text"}],
                "lines": [{"id": "line-0", "text": "corrected full line text"}],
            },
            "ocr_profile": ocr_profile,
            "ocr_layout": {
                "image": layout.get("image", {}),
                "lines": [
                    {
                        "id": line.get("id"),
                        "text": line.get("text"),
                        "direction": line.get("direction"),
                        "atomIds": line.get("atomIds", []),
                    }
                    for line in layout.get("lines", [])
                ],
                "atoms": [
                    {
                        "id": atom.get("id"),
                        "lineId": atom.get("lineId"),
                        "text": atom.get("text"),
                        "direction": atom.get("direction"),
                    }
                    for atom in layout.get("atoms", [])
                ],
            },
        }
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": base64.b64encode(image_bytes).decode("ascii"),
                            }
                        },
                        {"text": json.dumps(prompt, ensure_ascii=False)},
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "response_mime_type": "application/json",
            },
        }

        response = requests.post(endpoint, json=payload, timeout=self._timeout_seconds)
        response.raise_for_status()
        body = response.json()
        text = (
            body.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}

    @staticmethod
    def _apply_corrections(layout: dict, corrections: dict) -> dict:
        refined = copy.deepcopy(layout)
        atoms_by_id = {str(atom.get("id")): atom for atom in refined.get("atoms", [])}
        lines_by_id = {str(line.get("id")): line for line in refined.get("lines", [])}

        for correction in corrections.get("atoms", []) or []:
            if not isinstance(correction, dict):
                continue
            atom_id = str(correction.get("id") or "")
            text = correction.get("text")
            if atom_id in atoms_by_id and isinstance(text, str) and text.strip():
                atoms_by_id[atom_id]["text"] = text.strip()

        for correction in corrections.get("lines", []) or []:
            if not isinstance(correction, dict):
                continue
            line_id = str(correction.get("id") or "")
            text = correction.get("text")
            if line_id in lines_by_id and isinstance(text, str) and text.strip():
                lines_by_id[line_id]["text"] = text.strip()

        for line in refined.get("lines", []) or []:
            line_id = str(line.get("id") or "")
            if not line.get("text"):
                line["text"] = "".join(
                    str(atoms_by_id[atom_id].get("text") or "")
                    for atom_id in line.get("atomIds", [])
                    if atom_id in atoms_by_id
                )
            for atom_id in line.get("atomIds", []):
                atom = atoms_by_id.get(str(atom_id))
                if atom is not None:
                    atom["lineId"] = line_id

        return refined

