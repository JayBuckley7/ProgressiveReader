import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  captureReflowAnchor,
  pageIndexForAnchor,
  segmentIdsForPage,
  visibleSegmentIds,
  type ReflowAnchor,
} from "./domAnchors";
import {
  clampPageIndex,
  createPageGeometry,
  pageIndexFromScrollLeft,
  physicalScrollLeftForPage,
  type PageGeometry,
  type ReflowLayoutMode,
} from "./geometry";

const VIEWPORT_CLASS = "pr-reflow-viewport";
const CONTENT_CLASS = "pr-reflow-content";
const UNMEASURED_CONTENT_VERSION = Symbol("unmeasured-content-version");

export interface UseReflowPaginationOptions {
  viewportRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  mode: ReflowLayoutMode;
  enabled?: boolean;
  columnGap?: number;
  /** Increment or replace this when rendered chapter markup changes. */
  contentVersion?: unknown;
  initialAnchor?: ReflowAnchor | null;
  onAnchorChange?: (anchor: ReflowAnchor) => void;
}

export interface ReflowPaginationResult {
  pageIndex: number;
  pageCount: number;
  /** Increments after every successfully measured layout, including resize/font reflow. */
  layoutRevision: number;
  isLayoutReady: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  visibleSegmentIds: string[];
  currentSegmentIds: string[];
  nextSegmentIds: string[];
  goToPage: (pageIndex: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  reflow: () => void;
  captureAnchor: () => ReflowAnchor | null;
  restoreAnchor: (anchor: ReflowAnchor) => void;
}

interface PaginationState {
  pageIndex: number;
  pageCount: number;
  layoutRevision: number;
  isLayoutReady: boolean;
  layoutContentVersion: unknown;
  visibleSegmentIds: string[];
  currentSegmentIds: string[];
  nextSegmentIds: string[];
}

function requestFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(() => callback(performance.now()), 0);
}

function cancelFrame(handle: number): void {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(handle);
  } else {
    window.clearTimeout(handle);
  }
}

function setPhysicalScrollLeft(viewport: HTMLElement, left: number): void {
  const boundedLeft = Math.max(0, left);
  try {
    viewport.scrollTo({ left: boundedLeft, behavior: "auto" });
  } catch {
    // Older embedded webviews can expose scrollTo without accepting options.
  }
  // Keep the assignment as a deterministic fallback and for DOM test environments.
  viewport.scrollLeft = boundedLeft;
}

function idsEqual(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

function statesEqual(first: PaginationState, second: PaginationState): boolean {
  return (
    first.pageIndex === second.pageIndex &&
    first.pageCount === second.pageCount &&
    first.layoutRevision === second.layoutRevision &&
    first.isLayoutReady === second.isLayoutReady &&
    Object.is(first.layoutContentVersion, second.layoutContentVersion) &&
    idsEqual(first.visibleSegmentIds, second.visibleSegmentIds) &&
    idsEqual(first.currentSegmentIds, second.currentSegmentIds) &&
    idsEqual(first.nextSegmentIds, second.nextSegmentIds)
  );
}

export function measureReflowGeometry(
  viewport: HTMLElement,
  content: HTMLElement,
  mode: ReflowLayoutMode,
  columnGap: number
): PageGeometry {
  const viewportRect = viewport.getBoundingClientRect();
  const viewportInlineSize = viewport.clientWidth || viewportRect.width || 1;
  const contentInlineSize = Math.max(
    viewportInlineSize,
    viewport.scrollWidth,
    content.scrollWidth
  );
  return createPageGeometry({
    mode,
    viewportInlineSize,
    contentInlineSize,
    gap: columnGap,
  });
}

export function useReflowPagination({
  viewportRef,
  contentRef,
  mode,
  enabled = true,
  columnGap = 24,
  contentVersion,
  initialAnchor = null,
  onAnchorChange,
}: UseReflowPaginationOptions): ReflowPaginationResult {
  const [state, setState] = useState<PaginationState>({
    pageIndex: 0,
    pageCount: 1,
    layoutRevision: 0,
    isLayoutReady: false,
    layoutContentVersion: UNMEASURED_CONTENT_VERSION,
    visibleSegmentIds: [],
    currentSegmentIds: [],
    nextSegmentIds: [],
  });
  const geometryRef = useRef<PageGeometry | null>(null);
  const geometryContentVersionRef = useRef<unknown>(UNMEASURED_CONTENT_VERSION);
  const layoutRevisionRef = useRef(0);
  const pageIndexRef = useRef(0);
  const anchorRef = useRef<ReflowAnchor | null>(initialAnchor);
  const pendingAnchorRef = useRef<ReflowAnchor | null>(initialAnchor);
  const onAnchorChangeRef = useRef(onAnchorChange);
  const frameRef = useRef<number | null>(null);
  const secondFrameRef = useRef<number | null>(null);
  const captureFrameRef = useRef<number | null>(null);

  useEffect(() => {
    onAnchorChangeRef.current = onAnchorChange;
  }, [onAnchorChange]);

  const captureAnchor = useCallback((): ReflowAnchor | null => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return null;
    const anchor = captureReflowAnchor(viewport, content, mode);
    if (anchor) anchorRef.current = anchor;
    return anchor;
  }, [contentRef, mode, viewportRef]);

  const publishAnchorAfterLayout = useCallback(() => {
    if (captureFrameRef.current !== null) cancelFrame(captureFrameRef.current);
    captureFrameRef.current = requestFrame(() => {
      captureFrameRef.current = null;
      const anchor = captureAnchor();
      if (anchor) onAnchorChangeRef.current?.(anchor);
    });
  }, [captureAnchor]);

  const updatePageState = useCallback(
    (
      pageIndex: number,
      geometry: PageGeometry,
      ready = true,
      layoutRevision = layoutRevisionRef.current
    ) => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      const boundedPage = clampPageIndex(pageIndex, geometry.pageCount);
      pageIndexRef.current = boundedPage;

      const nextState: PaginationState = {
        pageIndex: boundedPage,
        pageCount: geometry.pageCount,
        layoutRevision,
        isLayoutReady: ready,
        layoutContentVersion: contentVersion,
        visibleSegmentIds: viewport && content ? visibleSegmentIds(viewport, content) : [],
        currentSegmentIds:
          viewport && content
            ? segmentIdsForPage(viewport, content, geometry, boundedPage)
            : [],
        nextSegmentIds:
          viewport && content && boundedPage + 1 < geometry.pageCount
            ? segmentIdsForPage(viewport, content, geometry, boundedPage + 1)
            : [],
      };
      setState((current) => (statesEqual(current, nextState) ? current : nextState));
    },
    [contentRef, contentVersion, viewportRef]
  );

  const performReflow = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!enabled || !viewport || !content) {
      geometryRef.current = null;
      geometryContentVersionRef.current = UNMEASURED_CONTENT_VERSION;
      setState((current) => ({
        ...current,
        isLayoutReady: false,
        layoutContentVersion: UNMEASURED_CONTENT_VERSION,
      }));
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const pageWidth = viewport.clientWidth || viewportRect.width || 1;
    const pageHeight = viewport.clientHeight || viewportRect.height || 1;
    viewport.style.setProperty("--pr-reflow-page-width", `${pageWidth}px`);
    viewport.style.setProperty("--pr-reflow-page-height", `${pageHeight}px`);
    viewport.style.setProperty("--pr-reflow-page-gap", `${Math.max(0, columnGap)}px`);

    // Reading scrollWidth forces the browser to settle CSS-column fragmentation.
    const geometry = measureReflowGeometry(viewport, content, mode, columnGap);
    geometryRef.current = geometry;
    geometryContentVersionRef.current = contentVersion;
    layoutRevisionRef.current += 1;
    const anchor = pendingAnchorRef.current ?? anchorRef.current;
    pendingAnchorRef.current = null;
    const anchoredPage = anchor
      ? pageIndexForAnchor(viewport, content, geometry, anchor)
      : null;
    const nextPageIndex = anchor
      ? (anchoredPage ?? 0)
      : clampPageIndex(pageIndexRef.current, geometry.pageCount);
    setPhysicalScrollLeft(viewport, physicalScrollLeftForPage(nextPageIndex, geometry));
    updatePageState(nextPageIndex, geometry, true, layoutRevisionRef.current);
    publishAnchorAfterLayout();
  }, [columnGap, contentRef, contentVersion, enabled, mode, publishAnchorAfterLayout, updatePageState, viewportRef]);

  const reflow = useCallback(() => {
    if (!anchorRef.current) captureAnchor();
    geometryContentVersionRef.current = UNMEASURED_CONTENT_VERSION;
    setState((current) => current.isLayoutReady
      ? { ...current, isLayoutReady: false, layoutContentVersion: UNMEASURED_CONTENT_VERSION }
      : current
    );
    if (frameRef.current !== null) cancelFrame(frameRef.current);
    if (secondFrameRef.current !== null) cancelFrame(secondFrameRef.current);
    frameRef.current = requestFrame(() => {
      frameRef.current = null;
      secondFrameRef.current = requestFrame(() => {
        secondFrameRef.current = null;
        performReflow();
      });
    });
  }, [captureAnchor, performReflow]);

  const goToPage = useCallback(
    (requestedPage: number) => {
      const viewport = viewportRef.current;
      const geometry = geometryRef.current;
      if (
        !viewport ||
        !geometry ||
        !Object.is(geometryContentVersionRef.current, contentVersion)
      ) return;
      const pageIndex = clampPageIndex(requestedPage, geometry.pageCount);
      setPhysicalScrollLeft(viewport, physicalScrollLeftForPage(pageIndex, geometry));
      updatePageState(pageIndex, geometry);
      publishAnchorAfterLayout();
    },
    [contentVersion, publishAnchorAfterLayout, updatePageState, viewportRef]
  );

  const nextPage = useCallback(() => goToPage(pageIndexRef.current + 1), [goToPage]);
  const previousPage = useCallback(() => goToPage(pageIndexRef.current - 1), [goToPage]);

  const restoreAnchor = useCallback(
    (anchor: ReflowAnchor) => {
      pendingAnchorRef.current = anchor;
      anchorRef.current = anchor;
      reflow();
    },
    [reflow]
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!enabled || !viewport || !content) return;

    const viewportAlreadyClassed = viewport.classList.contains(VIEWPORT_CLASS);
    const contentAlreadyClassed = content.classList.contains(CONTENT_CLASS);
    viewport.classList.add(VIEWPORT_CLASS);
    content.classList.add(CONTENT_CLASS);
    viewport.setAttribute("data-pr-reflow-mode", mode);
    content.setAttribute("data-pr-reflow-mode", mode);

    const handleScroll = () => {
      const geometry = geometryRef.current;
      if (
        !geometry ||
        !Object.is(geometryContentVersionRef.current, contentVersion)
      ) return;
      const pageIndex = pageIndexFromScrollLeft(viewport.scrollLeft, geometry);
      updatePageState(pageIndex, geometry);
      publishAnchorAfterLayout();
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });

    const observedImages = new Map<HTMLImageElement, () => void>();
    const observeImages = () => {
      content.querySelectorAll("img").forEach((image) => {
        if (observedImages.has(image)) return;
        const handleImageSettled = () => reflow();
        image.addEventListener("load", handleImageSettled);
        image.addEventListener("error", handleImageSettled);
        observedImages.set(image, () => {
          image.removeEventListener("load", handleImageSettled);
          image.removeEventListener("error", handleImageSettled);
        });
        if (typeof image.decode === "function") {
          void image.decode().then(handleImageSettled, () => undefined);
        }
      });
    };
    observeImages();

    const mutationObserver = typeof MutationObserver === "function"
      ? new MutationObserver(() => {
          observeImages();
          reflow();
        })
      : null;
    mutationObserver?.observe(content, { childList: true, characterData: true, subtree: true });

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => reflow())
      : null;
    resizeObserver?.observe(viewport);
    if (!resizeObserver) window.addEventListener("resize", reflow);

    let active = true;
    const fonts = document.fonts;
    const handleFontsSettled = () => reflow();
    fonts?.addEventListener?.("loadingdone", handleFontsSettled);
    if (fonts?.ready) {
      void fonts.ready.then(() => {
        if (active) reflow();
      });
    }

    reflow();
    return () => {
      active = false;
      viewport.removeEventListener("scroll", handleScroll);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", reflow);
      fonts?.removeEventListener?.("loadingdone", handleFontsSettled);
      observedImages.forEach((cleanup) => cleanup());
      if (!viewportAlreadyClassed) viewport.classList.remove(VIEWPORT_CLASS);
      if (!contentAlreadyClassed) content.classList.remove(CONTENT_CLASS);
      viewport.removeAttribute("data-pr-reflow-mode");
      content.removeAttribute("data-pr-reflow-mode");
      viewport.style.removeProperty("--pr-reflow-page-width");
      viewport.style.removeProperty("--pr-reflow-page-height");
      viewport.style.removeProperty("--pr-reflow-page-gap");
    };
  }, [contentRef, contentVersion, enabled, mode, publishAnchorAfterLayout, reflow, updatePageState, viewportRef]);

  useEffect(() => {
    if (initialAnchor) pendingAnchorRef.current = initialAnchor;
    reflow();
  }, [contentVersion, initialAnchor, reflow]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelFrame(frameRef.current);
      if (secondFrameRef.current !== null) cancelFrame(secondFrameRef.current);
      if (captureFrameRef.current !== null) cancelFrame(captureFrameRef.current);
    },
    []
  );

  const isCurrentLayout = state.isLayoutReady && Object.is(
    state.layoutContentVersion,
    contentVersion
  );

  return {
    pageIndex: state.pageIndex,
    pageCount: state.pageCount,
    layoutRevision: state.layoutRevision,
    isLayoutReady: isCurrentLayout,
    canGoPrevious: isCurrentLayout && state.pageIndex > 0,
    canGoNext: isCurrentLayout && state.pageIndex + 1 < state.pageCount,
    visibleSegmentIds: isCurrentLayout ? state.visibleSegmentIds : [],
    currentSegmentIds: isCurrentLayout ? state.currentSegmentIds : [],
    nextSegmentIds: isCurrentLayout ? state.nextSegmentIds : [],
    goToPage,
    nextPage,
    previousPage,
    reflow,
    captureAnchor,
    restoreAnchor,
  };
}
