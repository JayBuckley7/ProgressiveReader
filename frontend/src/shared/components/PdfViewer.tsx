import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface PdfViewerHandle {
  goToPage: (page: number) => void;
}

interface PdfViewerProps {
  data: ArrayBuffer;
  onPageCount?: (count: number) => void;
}

const pdfJsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const pdfViewerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.js';
const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

type PdfViewportLike = {
  width: number;
  height: number;
};

type PdfPageLike = {
  getViewport: (opts: { scale: number }) => PdfViewportLike;
  render: (opts: { canvasContext: CanvasRenderingContext2D | null; viewport: PdfViewportLike }) => { promise: Promise<unknown> };
  getTextContent: () => Promise<unknown>;
};

type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
};

type PdfLoadingTaskLike = {
  promise: Promise<PdfDocumentLike>;
};

type PdfJsLibLike = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (opts: { data: ArrayBuffer }) => PdfLoadingTaskLike;
  renderTextLayer: (opts: { textContent: unknown; container: HTMLElement; viewport: PdfViewportLike; textDivs: unknown[] }) => unknown;
};

function getPdfJsLib(): PdfJsLibLike | null {
  const w = window as unknown as { pdfjsLib?: PdfJsLibLike };
  return w.pdfjsLib ?? null;
}

function hasPdfJsViewer(): boolean {
  const w = window as unknown as { pdfjsViewer?: unknown };
  return Boolean(w.pdfjsViewer);
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(s);
  });
}

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(
  ({ data, onPageCount }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<HTMLDivElement[]>([]);

    useImperativeHandle(ref, () => ({
      goToPage(page: number) {
        const el = pageRefs.current[page - 1];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }));

	    useEffect(() => {
	      const renderPdf = async () => {
	        if (!containerRef.current) return;
	        containerRef.current.innerHTML = '';
	        pageRefs.current = [];
	        if (!getPdfJsLib()) {
	          await loadScript(pdfJsUrl);
	        }
	        if (!hasPdfJsViewer()) {
	          await loadScript(pdfViewerUrl);
	        }
	        const pdfjsLib = getPdfJsLib();
	        if (!pdfjsLib) return;
	        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
	        const loadingTask = pdfjsLib.getDocument({ data });
	        const pdf = await loadingTask.promise;
	        onPageCount?.(pdf.numPages);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });

        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page relative mb-4';
        pageContainer.style.position = 'relative';
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pageContainer.appendChild(canvas);

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;

        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer absolute top-0 left-0';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        textLayerDiv.style.zIndex = '2';
        pageContainer.appendChild(textLayerDiv);

        const textContent = await page.getTextContent();
        pdfjsLib.renderTextLayer({ textContent, container: textLayerDiv, viewport, textDivs: [] });

          containerRef.current!.appendChild(pageContainer);
          pageRefs.current.push(pageContainer);
        }
      };
      renderPdf();
    }, [data]);

    return <div ref={containerRef} className="pdf-viewer space-y-4"></div>;
  }
);
