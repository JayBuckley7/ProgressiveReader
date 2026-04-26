import { describe, expect, it } from "vitest";

import {
  alignLineTokensToOverlay,
  alignTokensToOverlay,
  alignTokensToOverlayByLine,
} from "@features/reader/pdfOverlay/tokenAlignment";
import type { PdfOverlayLayout } from "@features/reader/pdfOverlay/types";
import type { Token } from "~/types";

function token(start: number, end: number, spelling = "word"): Token {
  return {
    start,
    end,
    length: end - start,
    rubies: [],
    card: {
      vid: 1,
      sid: 1,
      rid: 1,
      state: ["not-in-deck"],
      spelling,
      reading: spelling,
      frequencyRank: null,
      pitchAccent: [],
      meanings: [],
    },
  };
}

describe("alignTokensToOverlay", () => {
  it("unions multiple OCR atoms into one overlay token", () => {
    const layout: PdfOverlayLayout = {
      status: "ready",
      cacheHit: false,
      contentHash: "abc",
      ocrProfile: "ja-pdf-overlay-v1",
      pageIndex: 0,
      image: { width: 1000, height: 1000 },
      lines: [
        {
          id: "line-0",
          text: "abcd",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.1, y: 0.1, width: 0.2, height: 0.6 },
          polygonNorm: [],
          atomIds: ["atom-0", "atom-1"],
        },
      ],
      atoms: [
        {
          id: "atom-0",
          text: "abc",
          lineId: "line-0",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.1, y: 0.1, width: 0.08, height: 0.25 },
          polygonNorm: [],
        },
        {
          id: "atom-1",
          text: "d",
          lineId: "line-0",
          order: 1,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.1, y: 0.36, width: 0.08, height: 0.12 },
          polygonNorm: [],
        },
      ],
    };

    const overlayTokens = alignTokensToOverlay(layout, [token(0, 4)]);
    expect(overlayTokens).toHaveLength(1);
    expect(overlayTokens[0].bboxNorm.x).toBeCloseTo(0.1);
    expect(overlayTokens[0].bboxNorm.y).toBeCloseTo(0.1);
    expect(overlayTokens[0].bboxNorm.height).toBeCloseTo(0.38);
    expect(overlayTokens[0].sourceAtomIds).toEqual(["atom-0", "atom-1"]);
  });
});

describe("alignLineTokensToOverlay", () => {
  it("keeps identical local offsets scoped to the requested OCR line", () => {
    const layout: PdfOverlayLayout = {
      status: "ready",
      cacheHit: false,
      contentHash: "abc",
      ocrProfile: "ja-pdf-overlay-v1",
      pageIndex: 0,
      image: { width: 1000, height: 1000 },
      lines: [
        {
          id: "line-left",
          text: "aa",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.1, y: 0.1, width: 0.08, height: 0.2 },
          polygonNorm: [],
          atomIds: ["atom-left"],
        },
        {
          id: "line-right",
          text: "bb",
          order: 1,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.8, y: 0.1, width: 0.08, height: 0.2 },
          polygonNorm: [],
          atomIds: ["atom-right"],
        },
      ],
      atoms: [
        {
          id: "atom-left",
          text: "aa",
          lineId: "line-left",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.1, y: 0.1, width: 0.08, height: 0.2 },
          polygonNorm: [],
        },
        {
          id: "atom-right",
          text: "bb",
          lineId: "line-right",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.8, y: 0.1, width: 0.08, height: 0.2 },
          polygonNorm: [],
        },
      ],
    };

    const overlayTokens = alignLineTokensToOverlay(layout, "line-right", [token(0, 2, "bb")]);

    expect(overlayTokens).toHaveLength(1);
    expect(overlayTokens[0].sourceAtomIds).toEqual(["atom-right"]);
    expect(overlayTokens[0].bboxNorm.x).toBeCloseTo(0.8);
    expect(overlayTokens[0].sentence).toBe("bb");
  });

  it("splits one OCR atom into separate vertical token hitboxes", () => {
    const layout: PdfOverlayLayout = {
      status: "ready",
      cacheHit: false,
      contentHash: "abc",
      ocrProfile: "ja-pdf-overlay-v1",
      pageIndex: 0,
      image: { width: 1000, height: 1000 },
      lines: [
        {
          id: "line-0",
          text: "aabb",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.4, y: 0.1, width: 0.08, height: 0.4 },
          polygonNorm: [],
          atomIds: ["atom-0"],
        },
      ],
      atoms: [
        {
          id: "atom-0",
          text: "aabb",
          lineId: "line-0",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.4, y: 0.1, width: 0.08, height: 0.4 },
          polygonNorm: [],
        },
      ],
    };

    const overlayTokens = alignLineTokensToOverlay(layout, "line-0", [token(0, 2, "aa"), token(2, 4, "bb")]);

    expect(overlayTokens).toHaveLength(2);
    expect(overlayTokens[0].bboxNorm.y).toBeCloseTo(0.1);
    expect(overlayTokens[0].bboxNorm.height).toBeCloseTo(0.2);
    expect(overlayTokens[1].bboxNorm.y).toBeCloseTo(0.3);
    expect(overlayTokens[1].bboxNorm.height).toBeCloseTo(0.2);
  });
});

describe("alignTokensToOverlayByLine", () => {
  it("maps global parser offsets back to line-local atom boxes", () => {
    const layout: PdfOverlayLayout = {
      status: "ready",
      cacheHit: false,
      contentHash: "abc",
      ocrProfile: "ja-pdf-overlay-v1",
      pageIndex: 0,
      image: { width: 1000, height: 1000 },
      lines: [
        {
          id: "line-left",
          text: "aa",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.1, y: 0.1, width: 0.08, height: 0.2 },
          polygonNorm: [],
          atomIds: ["atom-left"],
        },
        {
          id: "line-right",
          text: "bb",
          order: 1,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.8, y: 0.1, width: 0.08, height: 0.2 },
          polygonNorm: [],
          atomIds: ["atom-right"],
        },
      ],
      atoms: [
        {
          id: "atom-left",
          text: "aa",
          lineId: "line-left",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.1, y: 0.1, width: 0.08, height: 0.2 },
          polygonNorm: [],
        },
        {
          id: "atom-right",
          text: "bb",
          lineId: "line-right",
          order: 0,
          direction: "vertical",
          confidence: 0.9,
          bboxNorm: { x: 0.8, y: 0.1, width: 0.08, height: 0.2 },
          polygonNorm: [],
        },
      ],
    };

    const overlayTokens = alignTokensToOverlayByLine(layout, [token(2, 4, "bb")]);

    expect(overlayTokens).toHaveLength(1);
    expect(overlayTokens[0].sourceAtomIds).toEqual(["atom-right"]);
    expect(overlayTokens[0].bboxNorm.x).toBeCloseTo(0.8);
  });
});
