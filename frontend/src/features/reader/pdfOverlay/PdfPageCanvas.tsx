import { BackendError } from "@core/backend/errors";
import { useAppDeps } from "@app/deps/AppDepsProvider";
import { showDefinitionPopup } from "@features/reader/components/JpdbPopupBridge";
import { loadConfig as loadJpdbConfig, parseText } from "@features/reader/content/api-adapter";
import { parseWithLocalLookup } from "@features/reader/utils/localTextParser";
import { appLog } from "@shared/appLog";
import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent, type PointerEvent } from "react";

import { PdfTokenOverlay } from "./PdfTokenOverlay";
import { alignTokensToOverlayByLine } from "./tokenAlignment";
import type { PdfOverlayLayout, PdfOverlayToken } from "./types";

type PdfViewportLike = {
  width: number;
  height: number;
};

type PdfPageLike = {
  getViewport: (opts: { scale: number }) => PdfViewportLike;
  render: (opts: { canvasContext: CanvasRenderingContext2D | null; viewport: PdfViewportLike }) => { promise: Promise<unknown> };
};

export type PdfDocumentLike = {
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
};

interface PdfPageCanvasProps {
  pdf: PdfDocumentLike;
  pageNumber: number;
  documentId?: string;
  documentVersion?: string;
  showTokenHighlights?: boolean;
  lookupEnabled?: boolean;
  inspectArea?: boolean;
  renderLookupStatus?: (status: ReactNode) => ReactNode;
  recognizePage?: (image: Blob, signal: AbortSignal, progress: (message: string) => void) => Promise<PdfOverlayLayout>;
}

const LOOKUP_SCALE = 2;
const MIN_CONTENT_ZOOM = 1;
const MAX_CONTENT_ZOOM = 4;

type PdfContentZoom = {
  scale: number;
  x: number;
  y: number;
};

type ActivePointer = {
  x: number;
  y: number;
};

type PinchGesture = {
  distance: number;
  centerX: number;
  centerY: number;
  zoom: PdfContentZoom;
};

type PanGesture = {
  x: number;
  y: number;
  zoom: PdfContentZoom;
};

function getDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem("prOcrOverlayDebug") === "true";
  } catch {
    return false;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distanceBetween(a: ActivePointer, b: ActivePointer): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centerBetween(a: ActivePointer, b: ActivePointer): ActivePointer {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Failed to serialize page canvas");
  }
  return blob;
}

async function computeSha256Hex(blob: Blob): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) {
    return undefined;
  }

  const buffer = await blob.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function PdfPageCanvas({
  pdf,
  pageNumber,
  documentId,
  documentVersion,
  showTokenHighlights = false,
  lookupEnabled = true,
  inspectArea = false,
  renderLookupStatus,
  recognizePage,
}: PdfPageCanvasProps) {
  const deps = useAppDeps();
  const [area, setArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [dragBox, setDragBox] = useState<typeof area>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomSurfaceRef = useRef<HTMLDivElement>(null);
  const activePointersRef = useRef(new Map<number, ActivePointer>());
  const pinchGestureRef = useRef<PinchGesture | null>(null);
  const panGestureRef = useRef<PanGesture | null>(null);
  const [page, setPage] = useState<PdfPageLike | null>(null);
  const [viewport, setViewport] = useState<PdfViewportLike | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [contentZoom, setContentZoom] = useState<PdfContentZoom>({ scale: 1, x: 0, y: 0 });
  const [ocrLayout, setOcrLayout] = useState<PdfOverlayLayout | null>(null);
  const [overlayTokens, setOverlayTokens] = useState<PdfOverlayToken[]>([]);
  const [isPreparingLookup, setIsPreparingLookup] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [lookupRetryable, setLookupRetryable] = useState(true);
  const [ocrRetryNonce, setOcrRetryNonce] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('Preparing lookup...');
  const renderedPageRef = useRef<PdfPageLike | null>(null);
  const preparedRenderVersionRef = useRef(0);
  const debug = useMemo(() => getDebugEnabled(), []);

  useEffect(() => {
    let cancelled = false;

    const loadPage = async () => {
      try {
        const nextPage = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const nextViewport = nextPage.getViewport({ scale: LOOKUP_SCALE });
        setPage(nextPage);
        setViewport(nextViewport);
      } catch (error) {
        appLog.error("[PdfPageCanvas] Failed to load PDF page", { pageNumber, error });
        if (!cancelled) {
          setOcrError("Failed to load page.");
        }
      }
    };

    setPage(null);
    setViewport(null);
    setRenderVersion(0);
    setContentZoom({ scale: 1, x: 0, y: 0 });
    setOcrLayout(null);
    setOverlayTokens([]);
    setOcrError(null);
    setOcrRetryNonce(0);
    renderedPageRef.current = null;
    preparedRenderVersionRef.current = 0;
    activePointersRef.current.clear();
    pinchGestureRef.current = null;
    panGestureRef.current = null;
    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [pageNumber, pdf]);

  useEffect(() => {
    if (!viewport || !page || !canvasRef.current) return;
    if (renderedPageRef.current === page) return;

    let cancelled = false;

    const renderPage = async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        await page.render({ canvasContext: context, viewport }).promise;
        if (cancelled) return;

        renderedPageRef.current = page;
        setRenderVersion((version) => version + 1);
      } catch (error) {
        appLog.error("[PdfPageCanvas] Failed to render PDF page", { pageNumber, error });
        if (!cancelled) {
          setOcrError("Failed to render page.");
        }
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
    };
  }, [page, pageNumber, viewport]);

  useEffect(() => {
    if (!lookupEnabled || !viewport || !canvasRef.current || renderVersion <= 0) return;
    if (inspectArea && !area) return;
    if (preparedRenderVersionRef.current === renderVersion) return;

    const controller = new AbortController();
    let stale = false;

    const prepareLookup = async () => {
      preparedRenderVersionRef.current = renderVersion;
      setIsPreparingLookup(true);
      setOcrError(null);

      try {
        loadJpdbConfig();
        let source = canvasRef.current!;
        if (inspectArea && area) {
          const crop = document.createElement('canvas');
          const scale = Math.min(1, 1200 / Math.max(source.width * area.width, source.height * area.height));
          crop.width = Math.max(1, Math.round(source.width * area.width * scale));
          crop.height = Math.max(1, Math.round(source.height * area.height * scale));
          const context = crop.getContext('2d');
          if (!context) throw new Error('Canvas is unavailable.');
          context.drawImage(source, area.x * source.width, area.y * source.height,
            area.width * source.width, area.height * source.height, 0, 0, crop.width, crop.height);
          source = crop;
        }
        const blob = await canvasToBlob(source);
        const contentHash = await computeSha256Hex(blob);
        let layout = recognizePage ? await recognizePage(blob, controller.signal, message => { if (!stale) setOcrStatus(message); }) : await deps.backend.ocr.processPageLayout({
          image: blob,
          pageIndex: pageNumber - 1,
          ...(contentHash ? { contentHash } : {}),
          documentId,
          documentVersion,
          signal: controller.signal,
        });
        if (stale) return;

        if (inspectArea && area) {
          const mapBox = (box: { x: number; y: number; width: number; height: number }) => ({
            x: area.x + box.x * area.width, y: area.y + box.y * area.height,
            width: box.width * area.width, height: box.height * area.height,
          });
          layout = { ...layout, image: { width: viewport.width, height: viewport.height },
            lines: layout.lines.map(line => ({ ...line, bboxNorm: mapBox(line.bboxNorm), polygonNorm: [] })),
            atoms: layout.atoms.map(atom => ({ ...atom, bboxNorm: mapBox(atom.bboxNorm), polygonNorm: [] })),
          };
        }
        const parsedLines = layout.lines.filter((line) => line.text.trim().length > 0);
        const textSegments = parsedLines.map((line) => line.text);
        const parseLocalLines = async () => {
          const batches = await Promise.all(textSegments.map(text => parseWithLocalLookup(text)));
          let offset = 0;
          return batches.flatMap((batch, index) => {
            const shifted = batch.map(token => ({ ...token, start: token.start + offset, end: token.end + offset }));
            offset += textSegments[index].length;
            return shifted;
          });
        };
        let tokens: Awaited<ReturnType<typeof parseText>> = [];
        if (textSegments.length > 0) {
          try {
            tokens = recognizePage
              ? await parseLocalLines()
              : await parseText(deps.backend.vocabulary, textSegments, { notifyOnError: false });
          } catch (error) {
            appLog.warn("[PdfPageCanvas] JPDB parse failed; falling back to local lookup", { pageNumber, error });
            tokens = await parseLocalLines();
          }
        }
        if (stale) return;

        startTransition(() => {
          setOcrLayout(layout);
          setOverlayTokens(alignTokensToOverlayByLine(layout, tokens, parsedLines.map((line) => line.id)));
        });
      } catch (error) {
        if (controller.signal.aborted || stale) return;
        appLog.error("[PdfPageCanvas] Failed to prepare lookup overlay", { pageNumber, error });
        setOcrError(error instanceof BackendError || (recognizePage && error instanceof Error) ? error.message : "Lookup unavailable on this page.");
        setLookupRetryable(!(error instanceof BackendError && ["SERVER_AI_DISABLED", "AUTH_REQUIRED"].includes(error.code)));
      } finally {
        if (!stale) {
          setIsPreparingLookup(false);
        }
      }
    };

    void prepareLookup();
    return () => {
      stale = true;
      controller.abort();
    };
  }, [deps.backend.ocr, deps.backend.vocabulary, documentId, documentVersion, ocrRetryNonce, pageNumber, renderVersion, viewport, recognizePage, lookupEnabled, inspectArea, area]);

  const handleTokenClick = (overlayToken: PdfOverlayToken, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    showDefinitionPopup(
      overlayToken.token.card.spelling || overlayToken.token.card.reading || "",
      { x: event.clientX, y: event.clientY },
      {
        token: overlayToken.token,
        position: overlayToken.token.start,
        sentence: overlayToken.sentence,
      },
      { pin: true, sourceElement: event.currentTarget }
    );
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointersRef.current.size === 1 && contentZoom.scale > 1) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panGestureRef.current = {
        x: event.clientX,
        y: event.clientY,
        zoom: contentZoom,
      };
    }

    if (activePointersRef.current.size === 2) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const [first, second] = Array.from(activePointersRef.current.values());
      const center = centerBetween(first, second);
      pinchGestureRef.current = {
        distance: Math.max(1, distanceBetween(first, second)),
        centerX: center.x,
        centerY: center.y,
        zoom: contentZoom,
      };
      panGestureRef.current = null;
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !activePointersRef.current.has(event.pointerId)) return;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointersRef.current.size === 1 && panGestureRef.current && contentZoom.scale > 1) {
      event.preventDefault();
      const pan = panGestureRef.current;
      setContentZoom({
        scale: pan.zoom.scale,
        x: pan.zoom.x + event.clientX - pan.x,
        y: pan.zoom.y + event.clientY - pan.y,
      });
      return;
    }

    if (activePointersRef.current.size !== 2 || !pinchGestureRef.current) return;

    event.preventDefault();
    const [first, second] = Array.from(activePointersRef.current.values());
    const start = pinchGestureRef.current;
    const center = centerBetween(first, second);
    const nextScale = clamp(
      start.zoom.scale * (distanceBetween(first, second) / start.distance),
      MIN_CONTENT_ZOOM,
      MAX_CONTENT_ZOOM
    );
    const scaleRatio = nextScale / start.zoom.scale;
    const surfaceRect = zoomSurfaceRef.current?.getBoundingClientRect();
    const originX = start.centerX - (surfaceRect?.left ?? 0);
    const originY = start.centerY - (surfaceRect?.top ?? 0);

    setContentZoom({
      scale: nextScale,
      x: center.x - start.centerX + originX - (originX - start.zoom.x) * scaleRatio,
      y: center.y - start.centerY + originY - (originY - start.zoom.y) * scaleRatio,
    });
  };

  const clearPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchGestureRef.current = null;
      panGestureRef.current = null;
      setContentZoom((zoom) => (zoom.scale <= 1.02 ? { scale: 1, x: 0, y: 0 } : zoom));
    }
  };

  const selectionPoint = (event: PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  };
  const selectionBox = (point: { x: number; y: number }) => {
    const start = dragStart.current!;
    return { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) };
  };
  const beginSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.preventDefault(); event.stopPropagation();
    dragStart.current = selectionPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragBox(null);
  };
  const moveSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current) setDragBox(selectionBox(selectionPoint(event)));
  };
  const endSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const box = selectionBox(selectionPoint(event));
    dragStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragBox(null);
    const rect = containerRef.current!.getBoundingClientRect();
    if (box.width * rect.width < 8 || box.height * rect.height < 8) return;
    // A click or cancelled drag must not discard the existing region or lookup.
    setOverlayTokens([]); setOcrLayout(null); setOcrError(null);
    preparedRenderVersionRef.current = 0;
    setArea(box);
  };

  const hasLookupReady = !isPreparingLookup && !ocrError && overlayTokens.length > 0;
  const statusMaxWidth = viewport ? { maxWidth: `${viewport.width}px` } : undefined;

  const lookupStatus = <>
      {inspectArea && !area && <p className="text-xs text-[color:var(--ui-muted)]">Drag over the text you want to inspect.</p>}
      <div className={renderLookupStatus ? "space-y-2 [&>div]:rounded [&>span]:block" : "sticky top-3 z-20 mx-auto mb-2 flex w-full justify-end px-1 pointer-events-none"} style={renderLookupStatus ? undefined : statusMaxWidth}>
        {isPreparingLookup ? (
          <div className="rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white shadow-sm" aria-live="polite">
            {ocrStatus}
          </div>
        ) : null}
        {hasLookupReady ? (
          <div
            className="flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-3 py-1 text-xs font-medium text-emerald-50 shadow-sm"
            aria-label="Lookup ready"
            title="Lookup ready"
          >
            <svg className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
            </svg>
            <span>Tap words to look up</span>
          </div>
        ) : null}
        {lookupEnabled && ocrLayout && !isPreparingLookup && !ocrError && !ocrLayout.lines.length ? <span className="rounded bg-black/70 px-3 py-1 text-xs text-white">No text detected. Try the other text layout or a clearer page.</span> : null}
        {ocrError ? (
          <div className="pointer-events-auto rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white shadow-sm" aria-live="polite">
            <span>{ocrError}</span>
            {lookupRetryable && <button
              type="button"
              className="ml-2 rounded-full bg-white/15 px-2 py-0.5 font-medium hover:bg-white/25"
              onClick={() => {
                preparedRenderVersionRef.current = 0;
                setOcrRetryNonce((nonce) => nonce + 1);
              }}
            >
              Retry lookup
            </button>}
          </div>
        ) : null}
      </div>
      {recognizePage && ocrLayout?.lines.length ? <details className="my-2 rounded border p-2"><summary>Recognized text</summary><p className="whitespace-pre-wrap select-text py-2">{ocrLayout.lines.map(line => line.text).join('\n')}</p></details> : null}
  </>;

  return (
    <div className="pdf-page mb-4">
      {renderLookupStatus ? renderLookupStatus(lookupStatus) : lookupStatus}
      <div
        ref={zoomSurfaceRef}
        className="overflow-hidden"
        style={{ touchAction: inspectArea || contentZoom.scale > 1 ? "none" : "pan-y", cursor: inspectArea ? "crosshair" : undefined }}
        onPointerDown={inspectArea ? beginSelection : handlePointerDown}
        onPointerMove={inspectArea ? moveSelection : handlePointerMove}
        onPointerUp={inspectArea ? endSelection : clearPointer}
        onPointerCancel={inspectArea ? () => { dragStart.current = null; setDragBox(null); } : clearPointer}
        onPointerLeave={inspectArea ? undefined : clearPointer}
      >
        <div className="flex justify-center">
          <div
            className="min-w-0 max-w-full will-change-transform"
            style={{
              width: viewport?.width,
              transform: `translate3d(${contentZoom.x}px, ${contentZoom.y}px, 0) scale(${contentZoom.scale})`,
              transformOrigin: "0 0",
            }}
          >
            <div
              ref={containerRef}
              className="relative w-full"
              style={viewport ? { aspectRatio: `${viewport.width} / ${viewport.height}` } : undefined}
            >
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full rounded-sm shadow-sm" />
              {(dragBox || (inspectArea && area)) && <div aria-label="Selected OCR area" className="pointer-events-none absolute z-10 border-2 border-sky-400 bg-sky-400/10" style={{ left: `${(dragBox || area)!.x * 100}%`, top: `${(dragBox || area)!.y * 100}%`, width: `${(dragBox || area)!.width * 100}%`, height: `${(dragBox || area)!.height * 100}%` }} />}
              {overlayTokens.length > 0 ? (
                <PdfTokenOverlay
                  tokens={overlayTokens}
                  debug={debug}
                  showHighlights={showTokenHighlights}
                  onTokenClick={handleTokenClick}
                />
              ) : null}
              {debug && ocrLayout ? (
                <div className="absolute right-3 top-3 z-[4] rounded bg-black/70 px-2 py-1 text-[10px] text-white">
                  {ocrLayout.cacheHit ? "cache" : "fresh"} | {ocrLayout.atoms.length} atoms | {ocrLayout.lines.length} lines
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
