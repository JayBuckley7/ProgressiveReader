import { useEffect, useRef } from 'react';

interface PdfViewerProps {
  data: ArrayBuffer;
}

const pdfJsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const pdfViewerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf_viewer.min.js';
const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

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

export function PdfViewer({ data }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderPdf = async () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      if (!(window as any).pdfjsLib) {
        await loadScript(pdfJsUrl);
      }
      if (!(window as any).pdfjsViewer) {
        await loadScript(pdfViewerUrl);
      }
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) return;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;
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
        pageContainer.appendChild(textLayerDiv);

        const textContent = await page.getTextContent();
        pdfjsLib.renderTextLayer({ textContent, container: textLayerDiv, viewport, textDivs: [] });

        containerRef.current!.appendChild(pageContainer);
      }
    };
    renderPdf();
  }, [data]);

  return <div ref={containerRef} className="pdf-viewer space-y-4"></div>;
}
