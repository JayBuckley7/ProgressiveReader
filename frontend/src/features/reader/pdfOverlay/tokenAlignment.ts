import type { Token } from "~/types";

import type { PdfOverlayAtomRange, PdfOverlayLayout, PdfOverlayToken } from "./types";

type NormBox = PdfOverlayToken["bboxNorm"];

function unionBoxes(boxes: NormBox[]) {
  const xs = boxes.map((box) => box.x);
  const ys = boxes.map((box) => box.y);
  const rights = boxes.map((box) => box.x + box.width);
  const bottoms = boxes.map((box) => box.y + box.height);

  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const right = Math.max(...rights);
  const bottom = Math.max(...bottoms);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

function sliceAtomBox(range: PdfOverlayAtomRange, start: number, end: number): NormBox | null {
  const atomLength = range.end - range.start;
  if (atomLength <= 0) return null;

  const overlapStart = Math.max(range.start, start);
  const overlapEnd = Math.min(range.end, end);
  if (overlapStart >= overlapEnd) return null;

  const startRatio = (overlapStart - range.start) / atomLength;
  const endRatio = (overlapEnd - range.start) / atomLength;
  const spanRatio = endRatio - startRatio;
  const box = range.atom.bboxNorm;

  if (range.atom.direction === "vertical") {
    return {
      x: box.x,
      y: box.y + box.height * startRatio,
      width: box.width,
      height: box.height * spanRatio,
    };
  }

  return {
    x: box.x + box.width * startRatio,
    y: box.y,
    width: box.width * spanRatio,
    height: box.height,
  };
}

function unionTokenBoxes(ranges: PdfOverlayAtomRange[], start: number, end: number): NormBox | null {
  const boxes = ranges.flatMap((range) => {
    const box = sliceAtomBox(range, start, end);
    return box ? [box] : [];
  });
  return boxes.length > 0 ? unionBoxes(boxes) : null;
}

export function buildAtomRanges(layout: PdfOverlayLayout): PdfOverlayAtomRange[] {
  const atomById = new Map(layout.atoms.map((atom) => [atom.id, atom]));
  const ranges: PdfOverlayAtomRange[] = [];
  let offset = 0;

  for (const line of layout.lines) {
    for (const atomId of line.atomIds) {
      const atom = atomById.get(atomId);
      if (!atom || !atom.text) continue;
      const start = offset;
      const end = offset + atom.text.length;
      ranges.push({ atom, start, end });
      offset = end;
    }
  }

  return ranges;
}

export function buildLineAtomRanges(layout: PdfOverlayLayout, lineId: string): PdfOverlayAtomRange[] {
  const line = layout.lines.find((candidate) => candidate.id === lineId);
  if (!line) return [];

  const atomById = new Map(layout.atoms.map((atom) => [atom.id, atom]));
  const ranges: PdfOverlayAtomRange[] = [];
  let offset = 0;

  for (const atomId of line.atomIds) {
    const atom = atomById.get(atomId);
    if (!atom || !atom.text) continue;
    const start = offset;
    const end = offset + atom.text.length;
    ranges.push({ atom, start, end });
    offset = end;
  }

  return ranges;
}

export function alignTokensToOverlay(layout: PdfOverlayLayout, tokens: Token[]): PdfOverlayToken[] {
  const atomRanges = buildAtomRanges(layout);
  const lineById = new Map(layout.lines.map((line) => [line.id, line]));

  return tokens.flatMap((token, index) => {
    const ranges = atomRanges.filter((range) => range.start < token.end && range.end > token.start);
    if (ranges.length === 0) {
      return [];
    }

    const bboxNorm = unionTokenBoxes(ranges, token.start, token.end);
    if (!bboxNorm) return [];

    const firstLine = lineById.get(ranges[0].atom.lineId);
    return [
      {
        id: `pdf-token-${index}-${token.start}-${token.end}`,
        token,
        bboxNorm,
        sourceAtomIds: ranges.map((range) => range.atom.id),
        sentence: firstLine?.text || "",
      },
    ];
  });
}

export function alignLineTokensToOverlay(layout: PdfOverlayLayout, lineId: string, tokens: Token[]): PdfOverlayToken[] {
  const atomRanges = buildLineAtomRanges(layout, lineId);
  const line = layout.lines.find((candidate) => candidate.id === lineId);

  return tokens.flatMap((token, index) => {
    const ranges = atomRanges.filter((range) => range.start < token.end && range.end > token.start);
    if (ranges.length === 0) {
      return [];
    }

    const bboxNorm = unionTokenBoxes(ranges, token.start, token.end);
    if (!bboxNorm) return [];

    return [
      {
        id: `pdf-token-${lineId}-${index}-${token.start}-${token.end}`,
        token,
        bboxNorm,
        sourceAtomIds: ranges.map((range) => range.atom.id),
        sentence: line?.text || "",
      },
    ];
  });
}

export function alignTokensToOverlayByLine(layout: PdfOverlayLayout, tokens: Token[], lineIds?: string[]): PdfOverlayToken[] {
  const includedLineIds = lineIds ? new Set(lineIds) : null;
  let lineOffset = 0;
  const lineRanges = layout.lines
    .filter((line) => !includedLineIds || includedLineIds.has(line.id))
    .map((line) => {
      const start = lineOffset;
      const end = start + line.text.length;
      lineOffset = end;
      return { line, start, end };
    });

  return tokens.flatMap((token, tokenIndex) =>
    lineRanges.flatMap(({ line, start: lineStart, end: lineEnd }) => {
      if (lineStart >= lineEnd || lineStart >= token.end || lineEnd <= token.start) {
        return [];
      }

      const localToken = {
        ...token,
        start: Math.max(0, token.start - lineStart),
        end: Math.min(lineEnd - lineStart, token.end - lineStart),
      };
      const lineTokens = alignLineTokensToOverlay(layout, line.id, [localToken]);
      return lineTokens.map((overlayToken) => ({
        ...overlayToken,
        id: `pdf-token-${line.id}-${tokenIndex}-${token.start}-${token.end}`,
        token,
      }));
    })
  );
}
