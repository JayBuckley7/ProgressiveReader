export type ReflowLayoutMode = "horizontal-columns" | "vertical-rl";

export interface PageGeometry {
  mode: ReflowLayoutMode;
  viewportInlineSize: number;
  contentInlineSize: number;
  gap: number;
  stride: number;
  pageCount: number;
  maxScrollOffset: number;
}

export interface PageGeometryInput {
  mode: ReflowLayoutMode;
  viewportInlineSize: number;
  contentInlineSize: number;
  gap?: number;
  roundingTolerance?: number;
}

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function clampPageIndex(pageIndex: number, pageCount: number): number {
  const lastPage = Math.max(0, Math.trunc(pageCount) - 1);
  if (!Number.isFinite(pageIndex)) return 0;
  return Math.min(Math.max(0, Math.trunc(pageIndex)), lastPage);
}

export function createPageGeometry({
  mode,
  viewportInlineSize,
  contentInlineSize,
  gap = 0,
  roundingTolerance = 0.75,
}: PageGeometryInput): PageGeometry {
  const viewport = Math.max(1, finiteNonNegative(viewportInlineSize, 1));
  const content = Math.max(viewport, finiteNonNegative(contentInlineSize, viewport));
  const effectiveGap = mode === "horizontal-columns" ? finiteNonNegative(gap) : 0;
  const stride = viewport + effectiveGap;
  const tolerance = finiteNonNegative(roundingTolerance);
  const pageCount = Math.max(1, Math.ceil((content + effectiveGap - tolerance) / stride));

  return {
    mode,
    viewportInlineSize: viewport,
    contentInlineSize: content,
    gap: effectiveGap,
    stride,
    pageCount,
    maxScrollOffset: Math.max(0, content - viewport),
  };
}

export function logicalOffsetForPage(pageIndex: number, geometry: PageGeometry): number {
  const boundedPage = clampPageIndex(pageIndex, geometry.pageCount);
  return Math.min(geometry.maxScrollOffset, boundedPage * geometry.stride);
}

/**
 * Converts a reading-order offset into the browser's physical scrollLeft. The
 * pagination viewport itself remains LTR; vertical-rl merely starts at its
 * physical right edge and progresses leftward.
 */
export function physicalScrollLeftForPage(pageIndex: number, geometry: PageGeometry): number {
  const logicalOffset = logicalOffsetForPage(pageIndex, geometry);
  return geometry.mode === "vertical-rl"
    ? geometry.maxScrollOffset - logicalOffset
    : logicalOffset;
}

export function logicalOffsetFromScrollLeft(scrollLeft: number, geometry: PageGeometry): number {
  const physicalOffset = Math.min(
    geometry.maxScrollOffset,
    finiteNonNegative(scrollLeft)
  );
  return geometry.mode === "vertical-rl"
    ? geometry.maxScrollOffset - physicalOffset
    : physicalOffset;
}

export function pageIndexFromLogicalOffset(
  logicalOffset: number,
  geometry: PageGeometry
): number {
  const boundedOffset = Math.min(
    geometry.maxScrollOffset,
    finiteNonNegative(logicalOffset)
  );
  if (
    geometry.pageCount > 1 &&
    geometry.maxScrollOffset - boundedOffset <= 1
  ) {
    return geometry.pageCount - 1;
  }
  return clampPageIndex(Math.round(boundedOffset / geometry.stride), geometry.pageCount);
}

export function pageIndexFromScrollLeft(scrollLeft: number, geometry: PageGeometry): number {
  return pageIndexFromLogicalOffset(logicalOffsetFromScrollLeft(scrollLeft, geometry), geometry);
}

export interface ContentRectPosition {
  /** Physical x coordinate in the scrollable content's coordinate system. */
  inlineStart: number;
  /** Physical right edge in the scrollable content's coordinate system. */
  inlineEnd: number;
}

export function pageIndexForContentRect(
  rect: ContentRectPosition,
  geometry: PageGeometry
): number {
  const logicalStart = geometry.mode === "vertical-rl"
    ? geometry.contentInlineSize - finiteNonNegative(rect.inlineEnd)
    : finiteNonNegative(rect.inlineStart);
  return clampPageIndex(Math.floor((logicalStart + 0.5) / geometry.stride), geometry.pageCount);
}

export function pagesIntersectedByContentRect(
  rect: ContentRectPosition,
  geometry: PageGeometry
): number[] {
  const physicalStart = Math.min(rect.inlineStart, rect.inlineEnd);
  const physicalEnd = Math.max(rect.inlineStart, rect.inlineEnd);
  const first = pageIndexForContentRect(
    geometry.mode === "vertical-rl"
      ? { inlineStart: physicalEnd, inlineEnd: physicalEnd }
      : { inlineStart: physicalStart, inlineEnd: physicalStart },
    geometry
  );
  const last = pageIndexForContentRect(
    geometry.mode === "vertical-rl"
      ? { inlineStart: physicalStart, inlineEnd: physicalStart }
      : { inlineStart: physicalEnd, inlineEnd: physicalEnd },
    geometry
  );
  const low = Math.min(first, last);
  const high = Math.max(first, last);
  return Array.from({ length: high - low + 1 }, (_, index) => low + index);
}
