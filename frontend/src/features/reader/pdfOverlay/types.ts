import type { OcrLayoutAtom, OcrLayoutBox, OcrPageLayoutResponse } from "@core/backend/ports";
import type { Token } from "~/types";

export type PdfOverlayToken = {
  id: string;
  token: Token;
  bboxNorm: OcrLayoutBox;
  sourceAtomIds: string[];
  sentence: string;
};

export type PdfOverlayAtomRange = {
  atom: OcrLayoutAtom;
  start: number;
  end: number;
};

export type PdfOverlayLayout = OcrPageLayoutResponse;
