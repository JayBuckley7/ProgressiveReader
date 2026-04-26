import { useAppDeps } from "@app/deps/AppDepsProvider";
import { showDefinitionPopup } from "@features/reader/components/JpdbPopup";
import { loadConfig as loadJpdbConfig, parseText } from "@features/reader/content/api-adapter";
import { parseWithLocalLookup } from "@features/reader/utils/localTextParser";
import { appLog } from "@shared/appLog";
import { startTransition, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

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

type PdfDocumentLike = {
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
};

interface PdfPageCanvasProps {
  pdf: PdfDocumentLike;
  pageNumber: number;
  documentId?: string;
  documentVersion?: string;
}

const LOOKUP_SCALE = 2;

function getDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem("prOcrOverlayDebug") === "true";
  } catch {
    return false;
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("Failed to serialize page canvas");
  }
  return blob;
}

async function computeSha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function PdfPageCanvas({
  pdf,
  pageNumber,
  documentId,
  documentVersion,
}: PdfPageCanvasProps) {
  const deps = useAppDeps();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState<PdfPageLike | null>(null);
  const [viewport, setViewport] = useState<PdfViewportLike | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [ocrLayout, setOcrLayout] = useState<PdfOverlayLayout | null>(null);
  const [overlayTokens, setOverlayTokens] = useState<PdfOverlayToken[]>([]);
  const [isPreparingLookup, setIsPreparingLookup] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrRetryNonce, setOcrRetryNonce] = useState(0);
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
    setOcrLayout(null);
    setOverlayTokens([]);
    setOcrError(null);
    setOcrRetryNonce(0);
    renderedPageRef.current = null;
    preparedRenderVersionRef.current = 0;
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
    if (!viewport || !canvasRef.current || renderVersion <= 0) return;
    if (preparedRenderVersionRef.current === renderVersion) return;

    const controller = new AbortController();
    let stale = false;

    const prepareLookup = async () => {
      preparedRenderVersionRef.current = renderVersion;
      setIsPreparingLookup(true);
      setOcrError(null);

      try {
        loadJpdbConfig();
        const blob = await canvasToBlob(canvasRef.current!);
        const contentHash = await computeSha256Hex(blob);
        const layout = await deps.backend.ocr.processPageLayout({
          image: blob,
          pageIndex: pageNumber - 1,
          contentHash,
          documentId,
          documentVersion,
          signal: controller.signal,
        });
        if (stale) return;

        const parsedLines = layout.lines.filter((line) => line.text.trim().length > 0);
        const textSegments = parsedLines.map((line) => line.text);
        let tokens: Awaited<ReturnType<typeof parseText>> = [];
        if (textSegments.length > 0) {
          try {
            tokens = await parseText(deps.backend.vocabulary, textSegments, { notifyOnError: false });
          } catch (error) {
            appLog.warn("[PdfPageCanvas] JPDB parse failed; falling back to local lookup", { pageNumber, error });
            tokens = await parseWithLocalLookup(textSegments.join(""));
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
        setOcrError("Lookup unavailable on this page.");
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
  }, [deps.backend.ocr, deps.backend.vocabulary, documentId, documentVersion, ocrRetryNonce, pageNumber, renderVersion, viewport]);

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

  const hasLookupReady = !isPreparingLookup && !ocrError && overlayTokens.length > 0;
  const statusMaxWidth = viewport ? { maxWidth: `${viewport.width}px` } : undefined;

  return (
    <div className="pdf-page mb-4">
      <div className="sticky top-3 z-20 mx-auto mb-2 flex w-full justify-end px-1 pointer-events-none" style={statusMaxWidth}>
        {isPreparingLookup ? (
          <div className="rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white shadow-sm" aria-live="polite">
            Preparing lookup...
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
        {ocrError ? (
          <div className="pointer-events-auto rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white shadow-sm" aria-live="polite">
            <span>{ocrError}</span>
            <button
              type="button"
              className="ml-2 rounded-full bg-white/15 px-2 py-0.5 font-medium hover:bg-white/25"
              onClick={() => {
                preparedRenderVersionRef.current = 0;
                setOcrRetryNonce((nonce) => nonce + 1);
              }}
            >
              Retry lookup
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex justify-center">
        <div
          ref={containerRef}
          className="relative w-full"
          style={viewport ? { maxWidth: `${viewport.width}px`, aspectRatio: `${viewport.width} / ${viewport.height}` } : undefined}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full rounded-sm shadow-sm" />
          {overlayTokens.length > 0 ? (
            <PdfTokenOverlay tokens={overlayTokens} debug={debug} onTokenClick={handleTokenClick} />
          ) : null}
          {debug && ocrLayout ? (
            <div className="absolute right-3 top-3 z-[4] rounded bg-black/70 px-2 py-1 text-[10px] text-white">
              {ocrLayout.cacheHit ? "cache" : "fresh"} | {ocrLayout.atoms.length} atoms | {ocrLayout.lines.length} lines
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
