import { lazy, Suspense } from "react";
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
  settings?: { fontSize?: number; fontFamily?: string };
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

  return (
    <div 
      ref={contentRef}
      className="flex-1 overflow-y-auto pb-24 px-3 sm:px-4 md:px-8 lg:px-16 touch-pan-y reader-content-transition"
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
        <div className="max-w-4xl mx-auto py-4 sm:py-6 md:py-8">
          {jsxContent ? (
            <div className="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed">
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

