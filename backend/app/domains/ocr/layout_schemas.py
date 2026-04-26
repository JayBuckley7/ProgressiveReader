"""Schemas for page-image OCR layout extraction."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class NormPoint(BaseModel):
    x: float
    y: float


class NormBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class OcrLayoutAtom(BaseModel):
    id: str
    text: str
    lineId: str
    order: int
    direction: Literal["horizontal", "vertical"]
    confidence: float
    bboxNorm: NormBox
    polygonNorm: list[NormPoint]


class OcrLayoutLine(BaseModel):
    id: str
    text: str
    order: int
    direction: Literal["horizontal", "vertical"]
    confidence: float
    bboxNorm: NormBox
    polygonNorm: list[NormPoint]
    atomIds: list[str]


class OcrLayoutImageInfo(BaseModel):
    width: int
    height: int


class OcrPageLayoutResponse(BaseModel):
    status: Literal["ready"] = "ready"
    cacheHit: bool
    contentHash: str
    ocrProfile: str
    pageIndex: int
    image: OcrLayoutImageInfo
    lines: list[OcrLayoutLine] = Field(default_factory=list)
    atoms: list[OcrLayoutAtom] = Field(default_factory=list)
