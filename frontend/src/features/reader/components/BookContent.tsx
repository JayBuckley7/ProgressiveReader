import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PdfViewerHandle } from "@shared/components/PdfViewer";
import type { BookMetadata } from "~/types";

const PdfViewer = lazy(() =>
  import("@shared/components/PdfViewer").then((module) => ({ default: module.PdfViewer }))
);

interface BookContentProps {
  bookMetadata: BookMetadata | null;
  contentRef: React.RefObject<HTMLDivElement>;
  jsxContent: React.ReactNode | null;
  error: string | null;
  isLoading: boolean;
  pdfData: ArrayBuffer | null;
  pdfViewerRef: React.RefObject<PdfViewerHandle>;
  pdfCurrentPage: number;
  setPdfCurrentPage: (page: number) => void;
  setPdfPageCount: (count: number) => void;
  settings?: { fontSize?: number; fontFamily?: string; verticalWriting?: boolean };
  showPdfTokenHighlights?: boolean;
}

export function BookContent({
  bookMetadata,
  contentRef,
  jsxContent,
  error,
  isLoading,
  pdfData,
  pdfViewerRef,
  pdfCurrentPage,
  setPdfCurrentPage,
  setPdfPageCount,
  settings,
  showPdfTokenHighlights = false,
}: BookContentProps) {
  const { t } = useTranslation();
  const verticalWriting = Boolean(
    bookMetadata && bookMetadata.fileType !== "pdf" && settings?.verticalWriting
  );

  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.scrollTop = 0;
    contentRef.current.scrollLeft = verticalWriting
      ? Math.max(0, contentRef.current.scrollWidth - contentRef.current.clientWidth)
      : 0;
  }, [contentRef, verticalWriting]);

  useEffect(() => {
    const readingSurface = contentRef.current;
    if (!readingSurface || !verticalWriting) return;

    const handleVerticalWheel = (event: WheelEvent) => {
      if (
        Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
        readingSurface.scrollWidth <= readingSurface.clientWidth
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      readingSurface.scrollLeft -= event.deltaY;
    };

    readingSurface.addEventListener("wheel", handleVerticalWheel, { passive: false });
    return () => readingSurface.removeEventListener("wheel", handleVerticalWheel);
  }, [contentRef, verticalWriting]);

  return (
    <div 
      ref={contentRef}
      data-writing-mode={verticalWriting ? "vertical-rl" : "horizontal-tb"}
      className={`flex-1 min-h-0 pb-24 px-3 sm:px-4 md:px-8 lg:px-16 reader-content-transition ${
        verticalWriting
          ? "overflow-x-auto overflow-y-hidden touch-pan-x overscroll-contain"
          : "overflow-y-auto touch-pan-y"
      }`}
      style={{
        fontSize: settings?.fontSize ? `${settings.fontSize}px` : '16px',
        fontFamily: settings?.fontFamily || 'Inter',
      }}
    >
      {bookMetadata?.fileType === 'pdf' ? (
        pdfData ? (
          <Suspense fallback={<div className="py-8 text-center">{t('reader.pdf.loading')}</div>}>
            <PdfViewer
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
        ) : (
          <div className="py-8 text-center">{t('reader.pdf.loading')}</div>
        )
      ) : (
        <div
          className={
            verticalWriting
              ? "h-full min-w-full box-border py-4 sm:py-6 md:py-8"
              : "max-w-4xl mx-auto py-4 sm:py-6 md:py-8"
          }
        >
          {jsxContent ? (
            <div
              lang={verticalWriting ? "ja" : undefined}
              className={`prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none ${
                verticalWriting
                  ? "reader-vertical-writing h-full w-max min-w-full"
                  : "leading-relaxed"
              }`}
            >
              {jsxContent}
            </div>
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
      )}
    </div>
  );
}

