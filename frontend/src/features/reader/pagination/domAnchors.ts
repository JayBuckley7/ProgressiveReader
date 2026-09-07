import {
  pageIndexForContentRect,
  type PageGeometry,
  type ReflowLayoutMode,
} from "./geometry";
import { codePointLength } from "./sourceSegments";

export const SEGMENT_ID_ATTRIBUTE = "data-pr-segment-id";
export const SOURCE_HASH_ATTRIBUTE = "data-pr-source-hash";
export const SOURCE_LENGTH_ATTRIBUTE = "data-pr-source-length";

export interface ReflowAnchor {
  segmentId: string;
  sourceHash?: string;
  /** Unicode code-point offset within the segment, not a UTF-16 offset. */
  textOffset: number;
}

type DocumentWithLegacyCaretApi = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

interface DomPosition {
  offsetNode: Node;
  offset: number;
}

function segmentElementForNode(node: Node | null, content: HTMLElement): HTMLElement | null {
  if (!node) return null;
  const element = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement;
  const segment = element?.closest<HTMLElement>(`[${SEGMENT_ID_ATTRIBUTE}]`) ?? null;
  return segment && content.contains(segment) ? segment : null;
}

function codePointOffsetWithinElement(
  segment: HTMLElement,
  endNode: Node,
  endOffset: number
): number {
  try {
    const range = segment.ownerDocument.createRange();
    range.selectNodeContents(segment);
    range.setEnd(endNode, endOffset);
    return codePointLength(range.toString());
  } catch {
    return 0;
  }
}

function segmentElementsById(content: HTMLElement, segmentId: string): HTMLElement[] {
  return Array.from(content.querySelectorAll<HTMLElement>(`[${SEGMENT_ID_ATTRIBUTE}]`))
    .filter((segment) => segment.getAttribute(SEGMENT_ID_ATTRIBUTE) === segmentId);
}

function declaredSourceLength(segments: readonly HTMLElement[]): number | null {
  const raw = segments[0]?.getAttribute(SOURCE_LENGTH_ATTRIBUTE);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function renderedLength(segments: readonly HTMLElement[]): number {
  return segments.reduce(
    (length, segment, index) =>
      length + codePointLength(segment.textContent ?? "") + (index > 0 ? 2 : 0),
    0
  );
}

function scaleOffset(offset: number, fromLength: number, toLength: number): number {
  if (fromLength <= 0 || fromLength === toLength) return Math.max(0, Math.trunc(offset));
  return Math.round(
    (Math.min(fromLength, Math.max(0, offset)) / fromLength) * Math.max(0, toLength)
  );
}

function rectIntersects(first: DOMRect, second: DOMRect): boolean {
  return (
    first.right > second.left &&
    first.left < second.right &&
    first.bottom > second.top &&
    first.top < second.bottom
  );
}

function rangeRects(range: Range): DOMRect[] {
  try {
    return Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 || rect.height > 0 || rect.right > rect.left || rect.bottom > rect.top
    );
  } catch {
    return [];
  }
}

function segmentViewportVisibility(
  segment: HTMLElement,
  viewportRect: DOMRect
): boolean | null {
  const rects = getSegmentRects(segment);
  return rects.length > 0
    ? rects.some((rect) => rectIntersects(rect, viewportRect))
    : null;
}

function segmentIntersectsViewport(segment: HTMLElement, viewportRect: DOMRect): boolean {
  return segmentViewportVisibility(segment, viewportRect) === true;
}

function boundedOffset(value: number, size: number): number {
  if (size <= 1) return 0;
  return Math.min(size - 1, Math.max(1, value));
}

/**
 * Probe a few points near the page's reading edge instead of trusting a single
 * corner. EPUBs commonly have block margins, floats, or media at that corner.
 */
function leadingEdgeProbePoints(
  viewportRect: DOMRect,
  mode: ReflowLayoutMode
): Array<{ x: number; y: number }> {
  const inlineOffsets = [
    boundedOffset(2, viewportRect.width),
    boundedOffset(viewportRect.width * 0.08, viewportRect.width),
    boundedOffset(viewportRect.width * 0.24, viewportRect.width),
  ];
  const blockOffsets = [
    boundedOffset(2, viewportRect.height),
    boundedOffset(viewportRect.height * 0.12, viewportRect.height),
    boundedOffset(viewportRect.height * 0.36, viewportRect.height),
    boundedOffset(viewportRect.height * 0.7, viewportRect.height),
  ];
  const points: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();

  blockOffsets.forEach((blockOffset) => {
    inlineOffsets.forEach((inlineOffset) => {
      const x = mode === "vertical-rl"
        ? viewportRect.right - inlineOffset
        : viewportRect.left + inlineOffset;
      const y = viewportRect.top + blockOffset;
      const key = `${x}:${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      points.push({ x, y });
    });
  });
  return points;
}

function positionsFromPoint(
  ownerDocument: DocumentWithLegacyCaretApi,
  x: number,
  y: number
): DomPosition[] {
  const positions: DomPosition[] = [];
  try {
    const caretPosition = ownerDocument.caretPositionFromPoint?.(x, y);
    if (caretPosition) {
      positions.push({
        offsetNode: caretPosition.offsetNode,
        offset: caretPosition.offset,
      });
    }
  } catch {
    // Some engines throw for a point just outside a fragmented column.
  }

  try {
    const caretRange = ownerDocument.caretRangeFromPoint?.(x, y);
    if (
      caretRange &&
      !positions.some(
        (position) =>
          position.offsetNode === caretRange.startContainer &&
          position.offset === caretRange.startOffset
      )
    ) {
      positions.push({
        offsetNode: caretRange.startContainer,
        offset: caretRange.startOffset,
      });
    }
  } catch {
    // Keep trying the remaining probe points.
  }
  return positions;
}

function adjacentUtf16End(text: string, offset: number): number {
  if (offset >= text.length) return offset;
  const codePoint = text.codePointAt(offset);
  return Math.min(text.length, offset + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1));
}

function adjacentUtf16Start(text: string, offset: number): number {
  if (offset <= 0) return 0;
  const previous = text.charCodeAt(offset - 1);
  return Math.max(
    0,
    offset - (previous >= 0xdc00 && previous <= 0xdfff && offset > 1 ? 2 : 1)
  );
}

/**
 * Returns null when the DOM cannot expose caret geometry. A point supplied by
 * the browser is still useful in that case, but known off-page positions must
 * be rejected because a segment may span multiple pages.
 */
function positionIntersectsViewport(
  position: DomPosition,
  viewportRect: DOMRect
): boolean | null {
  const { offsetNode, offset } = position;
  const ownerDocument = offsetNode.ownerDocument;
  if (!ownerDocument) return null;
  let observedGeometry = false;

  try {
    const caret = ownerDocument.createRange();
    caret.setStart(offsetNode, offset);
    caret.collapse(true);
    const rects = rangeRects(caret);
    observedGeometry ||= rects.length > 0;
    if (rects.some((rect) => rectIntersects(rect, viewportRect))) return true;
  } catch {
    // Try a neighboring character or child below.
  }

  try {
    const adjacent = ownerDocument.createRange();
    if (offsetNode.nodeType === Node.TEXT_NODE) {
      const text = (offsetNode as Text).data;
      const safeOffset = Math.min(text.length, Math.max(0, offset));
      const start = safeOffset < text.length
        ? safeOffset
        : adjacentUtf16Start(text, safeOffset);
      const end = safeOffset < text.length
        ? adjacentUtf16End(text, safeOffset)
        : safeOffset;
      if (end <= start) return observedGeometry ? false : null;
      adjacent.setStart(offsetNode, start);
      adjacent.setEnd(offsetNode, end);
    } else {
      const children = offsetNode.childNodes;
      const child = children[Math.min(Math.max(0, offset), Math.max(0, children.length - 1))];
      if (!child) return observedGeometry ? false : null;
      adjacent.selectNode(child);
    }
    const rects = rangeRects(adjacent);
    observedGeometry ||= rects.length > 0;
    if (rects.some((rect) => rectIntersects(rect, viewportRect))) return true;
  } catch {
    // Range geometry is optional in test DOMs and older engines.
  }

  return observedGeometry ? false : null;
}

export function getSegmentRects(segment: HTMLElement): DOMRect[] {
  try {
    const range = segment.ownerDocument.createRange();
    range.selectNodeContents(segment);
    const rects = rangeRects(range);
    if (rects.length > 0) return rects;
  } catch {
    // Fall through to the element box for test DOMs and non-rangeable nodes.
  }
  return Array.from(segment.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0 || rect.right > rect.left || rect.bottom > rect.top
  );
}

export function visibleSegmentIds(
  viewport: HTMLElement,
  content: HTMLElement
): string[] {
  const viewportRect = viewport.getBoundingClientRect();
  const ids: string[] = [];
  content.querySelectorAll<HTMLElement>(`[${SEGMENT_ID_ATTRIBUTE}]`).forEach((segment) => {
    if (!getSegmentRects(segment).some((rect) => rectIntersects(rect, viewportRect))) return;
    const id = segment.getAttribute(SEGMENT_ID_ATTRIBUTE);
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

function contentRectFromViewportRect(rect: DOMRect, viewport: HTMLElement): {
  inlineStart: number;
  inlineEnd: number;
} {
  const viewportRect = viewport.getBoundingClientRect();
  return {
    inlineStart: rect.left - viewportRect.left + viewport.scrollLeft,
    inlineEnd: rect.right - viewportRect.left + viewport.scrollLeft,
  };
}

export function segmentIdsForPage(
  viewport: HTMLElement,
  content: HTMLElement,
  geometry: PageGeometry,
  pageIndex: number
): string[] {
  const ids: string[] = [];
  content.querySelectorAll<HTMLElement>(`[${SEGMENT_ID_ATTRIBUTE}]`).forEach((segment) => {
    const appearsOnPage = getSegmentRects(segment).some((rect) => {
      const contentRect = contentRectFromViewportRect(rect, viewport);
      return pageIndexForContentRect(contentRect, geometry) === pageIndex;
    });
    const id = segment.getAttribute(SEGMENT_ID_ATTRIBUTE);
    if (appearsOnPage && id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

function fallbackVisibleSegment(
  viewport: HTMLElement,
  content: HTMLElement
): HTMLElement | null {
  const viewportRect = viewport.getBoundingClientRect();
  return Array.from(content.querySelectorAll<HTMLElement>(`[${SEGMENT_ID_ATTRIBUTE}]`))
    .find((segment) => segmentIntersectsViewport(segment, viewportRect)) ?? null;
}

function anchorForRenderedOffset(
  content: HTMLElement,
  segment: HTMLElement,
  offsetWithinSegment: number
): ReflowAnchor | null {
  const segmentId = segment.getAttribute(SEGMENT_ID_ATTRIBUTE);
  if (!segmentId) return null;
  const matchingSegments = segmentElementsById(content, segmentId);
  const segmentIndex = matchingSegments.indexOf(segment);
  const priorTextLength = matchingSegments
    .slice(0, Math.max(0, segmentIndex))
    .reduce((length, part) => length + codePointLength(part.textContent ?? "") + 2, 0);
  const rawTextOffset = priorTextLength + Math.max(0, Math.trunc(offsetWithinSegment));
  const sourceLength = declaredSourceLength(matchingSegments);

  return {
    segmentId,
    sourceHash:
      segment.getAttribute(SOURCE_HASH_ATTRIBUTE) ??
      content.getAttribute(SOURCE_HASH_ATTRIBUTE) ??
      undefined,
    // Translation and mix mode can change the rendered character count. When
    // source metadata is available, keep the persisted offset in source-text
    // coordinates so it remains stable when those modes are toggled.
    textOffset:
      sourceLength === null
        ? rawTextOffset
        : scaleOffset(rawTextOffset, renderedLength(matchingSegments), sourceLength),
  };
}

/** Build a stable source-coordinate anchor for an element such as an EPUB fragment target. */
export function reflowAnchorForElement(
  content: HTMLElement,
  element: HTMLElement
): ReflowAnchor | null {
  if (!content.contains(element)) return null;
  const segment = element.closest<HTMLElement>(`[${SEGMENT_ID_ATTRIBUTE}]`);
  if (!segment || !content.contains(segment)) return null;

  let offsetWithinSegment = 0;
  if (element !== segment) {
    try {
      const prefix = element.ownerDocument.createRange();
      prefix.selectNodeContents(segment);
      prefix.setEndBefore(element);
      offsetWithinSegment = codePointLength(prefix.toString());
    } catch {
      offsetWithinSegment = 0;
    }
  }
  return anchorForRenderedOffset(content, segment, offsetWithinSegment);
}

function firstVisibleTextOffset(
  segment: HTMLElement,
  viewportRect: DOMRect
): number | null {
  const showText = segment.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = segment.ownerDocument.createTreeWalker(segment, showText);
  let renderedOffset = 0;
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const codePoints = codePointLength(textNode.data);
    if (codePoints > 0) {
      try {
        const range = segment.ownerDocument.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, textNode.data.length);
        if (rangeRects(range).some((rect) => rectIntersects(rect, viewportRect))) {
          // The predicate becomes true once the prefix includes the first
          // visible glyph. A binary search avoids measuring every character.
          let low = 1;
          let high = codePoints;
          while (low < high) {
            const middle = Math.floor((low + high) / 2);
            range.setEnd(textNode, utf16OffsetForCodePoints(textNode.data, middle));
            if (rangeRects(range).some((rect) => rectIntersects(rect, viewportRect))) {
              high = middle;
            } else {
              low = middle + 1;
            }
          }
          return renderedOffset + low - 1;
        }
      } catch {
        // Continue to another text node; an atomic/media fallback remains.
      }
    }
    renderedOffset += codePoints;
    node = walker.nextNode();
  }
  return null;
}

function geometryFallbackAnchor(
  viewport: HTMLElement,
  content: HTMLElement
): ReflowAnchor | null {
  const viewportRect = viewport.getBoundingClientRect();
  const visibleSegments = Array.from(
    content.querySelectorAll<HTMLElement>(`[${SEGMENT_ID_ATTRIBUTE}]`)
  ).filter((segment) => segmentIntersectsViewport(segment, viewportRect));

  for (const segment of visibleSegments) {
    const offset = firstVisibleTextOffset(segment, viewportRect);
    if (offset !== null) return anchorForRenderedOffset(content, segment, offset);
  }

  // A media-only page has no text position to estimate. Its structural segment
  // is still a better locator than losing the current page completely.
  return visibleSegments[0]
    ? anchorForRenderedOffset(content, visibleSegments[0], 0)
    : null;
}

export function captureReflowAnchor(
  viewport: HTMLElement,
  content: HTMLElement,
  mode: ReflowLayoutMode
): ReflowAnchor | null {
  const viewportRect = viewport.getBoundingClientRect();
  const ownerDocument = content.ownerDocument as DocumentWithLegacyCaretApi;
  let mediaCandidate: HTMLElement | null = null;

  for (const point of leadingEdgeProbePoints(viewportRect, mode)) {
    for (const position of positionsFromPoint(ownerDocument, point.x, point.y)) {
      const segment = segmentElementForNode(position.offsetNode, content);
      if (!segment || segmentViewportVisibility(segment, viewportRect) === false) continue;
      if (positionIntersectsViewport(position, viewportRect) === false) continue;

      if (!(segment.textContent ?? "").trim()) {
        mediaCandidate ??= segment;
        continue;
      }
      const offset = codePointOffsetWithinElement(
        segment,
        position.offsetNode,
        position.offset
      );
      return anchorForRenderedOffset(content, segment, offset);
    }
  }

  return (
    geometryFallbackAnchor(viewport, content) ??
    (mediaCandidate ? anchorForRenderedOffset(content, mediaCandidate, 0) : null) ??
    (() => {
      const segment = fallbackVisibleSegment(viewport, content);
      return segment ? anchorForRenderedOffset(content, segment, 0) : null;
    })()
  );
}

function utf16OffsetForCodePoints(value: string, requestedOffset: number): number {
  const target = Math.max(0, Math.trunc(requestedOffset));
  return Array.from(value).slice(0, target).join("").length;
}

export function rangeForAnchor(content: HTMLElement, anchor: ReflowAnchor): Range | null {
  const segments = segmentElementsById(content, anchor.segmentId);
  const firstSegment = segments[0];
  if (!firstSegment) return null;
  const expectedSourceHash =
    firstSegment.getAttribute(SOURCE_HASH_ATTRIBUTE) ?? content.getAttribute(SOURCE_HASH_ATTRIBUTE);
  if (anchor.sourceHash && expectedSourceHash && anchor.sourceHash !== expectedSourceHash) return null;

  const sourceLength = declaredSourceLength(segments);
  let remaining = sourceLength === null
    ? Math.max(0, Math.trunc(anchor.textOffset))
    : scaleOffset(anchor.textOffset, sourceLength, renderedLength(segments));
  let lastTextNode: Text | null = null;
  for (const [segmentIndex, segment] of segments.entries()) {
    const showText = segment.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
    const walker = segment.ownerDocument.createTreeWalker(segment, showText);
    let node = walker.nextNode();
    while (node) {
      const textNode = node as Text;
      lastTextNode = textNode;
      const length = codePointLength(textNode.data);
      if (remaining <= length) {
        const range = segment.ownerDocument.createRange();
        range.setStart(textNode, utf16OffsetForCodePoints(textNode.data, remaining));
        range.collapse(true);
        return range;
      }
      remaining -= length;
      node = walker.nextNode();
    }
    if (segmentIndex < segments.length - 1) remaining = Math.max(0, remaining - 2);
  }

  const range = firstSegment.ownerDocument.createRange();
  if (lastTextNode) {
    range.setStart(lastTextNode, lastTextNode.data.length);
  } else {
    range.selectNodeContents(firstSegment);
    range.collapse(true);
  }
  range.collapse(true);
  return range;
}

export function pageIndexForAnchor(
  viewport: HTMLElement,
  content: HTMLElement,
  geometry: PageGeometry,
  anchor: ReflowAnchor
): number | null {
  const range = rangeForAnchor(content, anchor);
  if (!range) return null;
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  if (!rect) return null;
  return pageIndexForContentRect(contentRectFromViewportRect(rect, viewport), geometry);
}
