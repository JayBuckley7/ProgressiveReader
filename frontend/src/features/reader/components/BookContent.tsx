import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PdfViewerHandle } from "@shared/components/PdfViewer";
import type { BookMetadata } from "~/types";

const CbzViewer = lazy(() => import("../comic/CbzViewer").then(module => ({ default: module.CbzViewer })));

const PdfViewer = lazy(() =>
  import("@shared/components/PdfViewer").then((module) => ({ default: module.PdfViewer }))
);

interface BookContentProps {
  ocrToolsHost?: HTMLElement | null;
  bookMetadata: BookMetadata | null;
  contentRef: React.RefObject<HTMLDivElement | null>;
  flowRef: React.RefObject<HTMLDivElement | null>;
  jsxContent: React.ReactNode | null;
  error: string | null;
  isLoading: boolean;
  pdfData: ArrayBuffer | null;
  pdfLoadError?: string | null;
  onRetryPdfLoad?: () => void;
  pdfViewerRef: React.RefObject<PdfViewerHandle | null>;
  pdfCurrentPage: number;
  setPdfCurrentPage: (page: number) => void;
  setPdfPageCount: (count: number) => void;
  settings?: { fontSize?: number; fontFamily?: string; verticalWriting?: boolean };
  showPdfTokenHighlights?: boolean;
}

export function BookContent({
  ocrToolsHost,
  bookMetadata,
  contentRef,
  flowRef,
  jsxContent,
  error,
  pdfData,
  pdfLoadError = null,
  onRetryPdfLoad,
  pdfViewerRef,
  pdfCurrentPage,
  setPdfCurrentPage,
  setPdfPageCount,
  settings,
  showPdfTokenHighlights = false,
}: BookContentProps) {
  const { t } = useTranslation();
  const verticalWriting = Boolean(
    bookMetadata && !["pdf", "cbz"].includes(bookMetadata.fileType) && settings?.verticalWriting
  );

  useEffect(() => {
    if (!["pdf", "cbz"].includes(bookMetadata?.fileType || "")) return;
    if (!contentRef.current) return;
    contentRef.current.scrollTop = 0;
    contentRef.current.scrollLeft = verticalWriting
      ? Math.max(0, contentRef.current.scrollWidth - contentRef.current.clientWidth)
      : 0;
  }, [bookMetadata?.fileType, contentRef, pdfCurrentPage, verticalWriting]);

  if (bookMetadata && ["pdf", "cbz"].includes(bookMetadata.fileType)) {
    const Viewer = bookMetadata.fileType === "cbz" ? CbzViewer : PdfViewer;
    const loadingLabel = bookMetadata.fileType === 'cbz' ? 'Opening comic…' : t('reader.pdf.loading');
    return (
      <div
        ref={contentRef}
        className="reader-content-transition flex-1 min-h-0 overflow-y-auto px-3 pb-24 sm:px-4 md:px-8 lg:px-16"
      >
        {pdfData ? (
          <Suspense fallback={<div className="py-8 text-center">{loadingLabel}</div>}>
            <Viewer
              {...(bookMetadata.fileType === "cbz" ? { ocrToolsHost } : {})}
              ref={pdfViewerRef}
              data={pdfData}
              currentPage={pdfCurrentPage}
              onCurrentPageChange={setPdfCurrentPage}
              onPageCount={setPdfPageCount}
              documentId={bookMetadata?.id}
              documentVersion={bookMetadata?.modifiedTime}
              showTokenHighlights={showPdfTokenHighlights}
            />
          </Suspense>
        ) : pdfLoadError ? (
          <div
            role="alert"
            className="mx-auto flex max-w-lg flex-col items-center gap-3 py-10 text-center"
          >
            <p className="font-medium text-red-600 dark:text-red-400">
              {bookMetadata.fileType === 'cbz' ? 'Could not open comic' : t("reader.pdf.loadFailed")}
            </p>
            <p className="text-sm text-[color:var(--ui-text-muted)]">{pdfLoadError}</p>
            {onRetryPdfLoad && (
              <button
                type="button"
                className="rounded-md bg-[color:var(--ui-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)] focus-visible:ring-offset-2"
                onClick={onRetryPdfLoad}
              >
                {t("reader.pdf.retry")}
              </button>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">{loadingLabel}</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 px-3 pb-20 pt-3 sm:px-4 sm:pb-24 sm:pt-4 md:px-8 lg:px-16">
      <div
        ref={contentRef}
        data-writing-mode={verticalWriting ? "vertical-rl" : "horizontal-tb"}
        className="reader-content-transition h-full min-h-0 w-full"
        style={{
          fontSize: settings?.fontSize ? `${settings.fontSize}px` : "16px",
          fontFamily: settings?.fontFamily || "Inter",
        }}
      >
        <div
          ref={flowRef}
          lang={verticalWriting ? "ja" : undefined}
          className={`prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none ${
            verticalWriting ? "reader-vertical-writing" : "leading-relaxed"
          }`}
        >
          {jsxContent ? (
            jsxContent
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-600 dark:text-red-400 mb-4">
                {t('reader.error.loading')} {error}
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center py-8 sm:py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

