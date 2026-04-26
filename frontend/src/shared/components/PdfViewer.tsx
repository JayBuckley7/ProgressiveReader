import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import { PdfPageCanvas } from "@features/reader/pdfOverlay/PdfPageCanvas";
import { getPdfJs } from "@shared/lib/pdfjs";

export interface PdfViewerHandle {
  goToPage: (page: number) => void;
}

interface PdfViewerProps {
  data: ArrayBuffer;
  currentPage: number;
  onCurrentPageChange?: (page: number) => void;
  onPageCount?: (count: number) => void;
  documentId?: string;
  documentVersion?: string;
}

type PdfViewportLike = {
  width: number;
  height: number;
};

type PdfPageLike = {
  getViewport: (opts: { scale: number }) => PdfViewportLike;
  render: (opts: { canvasContext: CanvasRenderingContext2D | null; viewport: PdfViewportLike }) => { promise: Promise<unknown> };
};

type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
};

type PdfLoadingTaskLike = {
  promise: Promise<PdfDocumentLike>;
};

type PdfJsLibLike = {
  getDocument: (opts: { data: ArrayBuffer }) => PdfLoadingTaskLike;
};

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(({
  data,
  currentPage,
  onCurrentPageChange,
  onPageCount,
  documentId,
  documentVersion,
}, ref) => {
  const [pdf, setPdf] = useState<PdfDocumentLike | null>(null);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    goToPage(page: number) {
      if (!pdf) return;
      const boundedPage = Math.min(Math.max(1, page), pdf.numPages);
      onCurrentPageChange?.(boundedPage);
    },
  }), [onCurrentPageChange, pdf]);

  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      try {
        const pdfjsLib = getPdfJs() as unknown as PdfJsLibLike;
        const nextPdf = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
        if (cancelled) return;
        setPdf(nextPdf);
        onPageCount?.(nextPdf.numPages);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load PDF");
      }
    };

    setPdf(null);
    setError(null);
    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [data, onPageCount]);

  useEffect(() => {
    if (!pdf || currentPage <= pdf.numPages) return;
    onCurrentPageChange?.(pdf.numPages);
  }, [currentPage, onCurrentPageChange, pdf]);

  if (error) {
    return <div className="py-8 text-center text-red-600 dark:text-red-400">{error}</div>;
  }

  if (!pdf) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <PdfPageCanvas
        key={Math.min(Math.max(1, currentPage), pdf.numPages)}
        pdf={pdf}
        pageNumber={Math.min(Math.max(1, currentPage), pdf.numPages)}
        documentId={documentId}
        documentVersion={documentVersion}
      />
    </div>
  );
});
