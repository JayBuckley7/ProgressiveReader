import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, useRef } from 'react';
import type { PdfViewerHandle } from '@shared/components/PdfViewer';
import { PdfPageCanvas, type PdfDocumentLike } from '../pdfOverlay/PdfPageCanvas';
import { useAppDeps } from '@app/deps/AppDepsProvider';
import { openCbz } from './cbzArchive';
import { withDriveOcr } from './cloudOcr';
import { recognizeLocalPage, type OcrDirection } from './localOcr';
import { useComicLibrary } from '@features/books/comics/useComicLibrary';
import { adoptComicInfo } from '@features/books/comics/comicInfo';
import { compareChapters, type Chapter, type ComicProgress } from '@features/books/comics/comicLibrary';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '@shared/contexts/AppDataContext';
import { comicId } from '@features/books/comics/ComicSeriesLibrary';

interface Props {
  data: ArrayBuffer; currentPage: number; onCurrentPageChange?: (page: number) => void;
  onPageCount?: (count: number) => void; documentId?: string; documentVersion?: string; showTokenHighlights?: boolean;
}

export const CbzViewer = forwardRef<PdfViewerHandle, Props>(function CbzViewer(props, ref) {
  const { auth, backendFetch } = useAppDeps();
  const comics = useComicLibrary();
  const navigate = useNavigate();
  const { books } = useAppData();
  const book = books.find(item => item.id === props.documentId || item.driveFileId === props.documentId);
  const recordId = book ? comicId(book) : props.documentId;
  const observedPage = useRef<number | null>(null);
  const touched = useRef(false);
  const [progressReady, setProgressReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const owner = auth.getUserId?.();
  const [archive, setArchive] = useState<Awaited<ReturnType<typeof openCbz>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<OcrDirection>('auto');
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [retry, setRetry] = useState(0);
  const [document, setDocument] = useState<PdfDocumentLike | null>(null);
  useEffect(() => {
    if (!archive || !recordId) return;
    let stopped = false;
    setProgressReady(false);
    touched.current = false;
    const restore = () => {
      const saved = comics.store.value<ComicProgress>(`progress:${recordId}`);
      const page = Math.max(1, Math.min(archive.pageCount, saved?.page || props.currentPage));
      observedPage.current = page;
      props.onCurrentPageChange?.(page);
    };
    restore();
    setProgressReady(true);
    void comics.store.sync().then(async () => {
      if (stopped) return;
      if (!touched.current) restore();
      await adoptComicInfo(comics.store, recordId, archive.comicInfo, book?.title || 'Chapter');
    });
    return () => { stopped = true; };
  }, [archive, recordId, comics.store]);
  useEffect(() => {
    if (!archive || !recordId || !progressReady || observedPage.current === props.currentPage) return;
    observedPage.current = props.currentPage;
    touched.current = true;
    const id = recordId;
    const prior = comics.store.value<ComicProgress>(`progress:${id}`);
    const value: ComicProgress = { page: Math.min(archive.pageCount, Math.max(1, props.currentPage)), pageCount: archive.pageCount, status: prior?.status === 'read' ? 'read' : 'reading', updatedAt: Date.now() };
    // Persist immediately; the store's request queue deduplicates acknowledgement/retry.
    comics.store.edit(`progress:${id}`, value);
  }, [archive, recordId, props.currentPage, progressReady, comics.store]);
  useImperativeHandle(ref, () => ({ goToPage(page) { if (archive) props.onCurrentPageChange?.(Math.max(1, Math.min(archive.pageCount, page))); } }), [archive, props.onCurrentPageChange]);
  useEffect(() => {
    let stopped = false;
    let opened: Awaited<ReturnType<typeof openCbz>> | undefined;
    setArchive(null); setDocument(null); setError(null);
    void openCbz(props.data).then(value => {
      opened = value;
      if (stopped) { void value.close(); return; }
      setArchive(value);
      props.onPageCount?.(value.pageCount);
      setDocument({ async getPage(page: number) {
        const blob = await value.page(page - 1);
        const image = await createImageBitmap(blob);
        const ratio = Math.min(1, 2400 / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * ratio)); const height = Math.max(1, Math.round(image.height * ratio));
        image.close();
        return {
          getViewport: () => ({ width, height }),
          render: ({ canvasContext }: { canvasContext: CanvasRenderingContext2D | null }) => ({ promise: (async () => {
            if (!canvasContext) throw new Error('Canvas is unavailable.');
            const bitmap = await createImageBitmap(blob);
            try { canvasContext.drawImage(bitmap, 0, 0, width, height); } finally { bitmap.close(); }
          })() }),
        };
      } });
    }).catch(failure => { if (!stopped) setError(failure.message || 'Could not open comic.'); });
    return () => { stopped = true; void opened?.close(); };
  }, [props.data, props.onPageCount, retry]);
  const recognize = useCallback(async (image: Blob, signal: AbortSignal, progress: (message: string) => void) => {
    const local = () => recognizeLocalPage(image, owner, direction, signal, progress);
    if (!owner || !archive) { setSyncStatus('OCR stays on this device. Sign in and connect Drive to sync.'); return local(); }
    const original = await archive.page(Math.max(0, Math.min(archive.pageCount - 1, props.currentPage - 1)));
    return withDriveOcr(original, owner, backendFetch, () => auth.getUserId?.() === owner, signal, local,
      message => { if (!signal.aborted && auth.getUserId?.() === owner) setSyncStatus(message); }, direction);
  }, [owner, direction, archive, props.currentPage, backendFetch, auth]);
  if (error) return <div role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></div>;
  if (!archive || !document) return <p>Opening comic…</p>;
  const page = Math.max(1, Math.min(archive.pageCount, props.currentPage));
  const chapter = comics.store.value<Chapter>(`chapter:${recordId}`);
  const ordered = books.filter(item => item.fileType === 'cbz' && chapter?.seriesId && comics.store.value<Chapter>(`chapter:${comicId(item)}`)?.seriesId === chapter.seriesId)
    .sort((a, b) => compareChapters(comics.store.value<Chapter>(`chapter:${comicId(a)}`)!, comics.store.value<Chapter>(`chapter:${comicId(b)}`)!));
  const currentIndex = ordered.findIndex(item => comicId(item) === recordId);
  const next = currentIndex < 0 ? undefined : ordered[currentIndex + 1];
  return <div>
    <div className="flex flex-wrap items-center gap-3 py-3">
      {page === archive.pageCount && recordId && <button className="rounded border px-3 py-2" onClick={() => comics.store.edit(`progress:${recordId}`, { page, pageCount: archive.pageCount, status: 'read', updatedAt: Date.now() })}>Finish chapter</button>}
      {next && <button className="rounded border px-3 py-2" onClick={() => navigate(`/book/${next.id}`)}>Next chapter</button>}
      <button className="rounded border px-3 py-2" aria-pressed={ocrEnabled} onClick={() => setOcrEnabled(value => !value)}>{ocrEnabled ? 'Turn OCR off' : 'Read text (OCR)'}</button>
      {ocrEnabled && <label>Text layout <select className="rounded border bg-[color:var(--ui-surface)] p-2" value={direction} onChange={event => setDirection(event.target.value as OcrDirection)}><option value="auto">Automatic</option><option value="vertical">Vertical Japanese</option></select></label>}
      <span className="text-sm text-[color:var(--ui-text-muted)]">OCR runs on this device. Tap recognized text to look it up.</span>
    </div>
    {comics.pending > 0 && <p role="status">{comics.message}</p>}
    {ocrEnabled && <p role="status" className="text-sm text-[color:var(--ui-text-muted)]">{syncStatus}</p>}
    <PdfPageCanvas key={`${owner}:${page}:${direction}:${ocrEnabled}`} pdf={document} pageNumber={page} documentId={props.documentId} documentVersion={props.documentVersion} showTokenHighlights={true} recognizePage={recognize} lookupEnabled={ocrEnabled} />
  </div>;
});
