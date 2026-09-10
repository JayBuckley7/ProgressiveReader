import { recognizeLocalPage } from './localOcr';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, useRef } from 'react';
import type { PdfViewerHandle } from '@shared/components/PdfViewer';
import { PdfPageCanvas, type PdfDocumentLike } from '../pdfOverlay/PdfPageCanvas';
import { useAppDeps } from '@app/deps/AppDepsProvider';
import { openCbz } from './cbzArchive';
import { loadDriveOcr } from './cloudOcr';
import { createPortal } from 'react-dom';
import { useComicLibrary } from '@features/books/comics/useComicLibrary';
import { adoptComicInfo } from '@features/books/comics/comicInfo';
import { compareChapters, type Chapter, type ComicProgress } from '@features/books/comics/comicLibrary';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '@shared/contexts/AppDataContext';
import { comicId } from '@features/books/comics/ComicSeriesLibrary';

interface Props {
  ocrToolsHost?: HTMLElement | null;
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
  const owner = auth.getUserId?.();
  const [archive, setArchive] = useState<Awaited<ReturnType<typeof openCbz>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocrStatusHost, setOcrStatusHost] = useState<HTMLDivElement | null>(null);
  const [ocrPreference, setOcrPreference] = useState<'off' | 'synced' | 'web'>(() => {
    try { const saved = localStorage.getItem('pr-comic-ocr-mode'); return saved === 'off' || saved === 'web' ? saved : 'synced'; } catch { return 'synced'; }
  });
  const chooseOcrMode = (mode: 'off' | 'synced' | 'web') => {
    setOcrPreference(mode);
    try { localStorage.setItem('pr-comic-ocr-mode', mode); } catch { /* Reading works without storage. */ }
  };
  const [ocrMenuOpen, setOcrMenuOpen] = useState(false);
  const ocrMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ocrMenuOpen) return;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!ocrMenuRef.current?.contains(event.target as Node)) setOcrMenuOpen(false);
    };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [ocrMenuOpen]);
  const pageKey = `${owner}:${props.documentId}:${props.currentPage}`;
  const [savedOcr, setSavedOcr] = useState<{ key: string; layout: Awaited<ReturnType<typeof loadDriveOcr>> | null; message: string } | null>(null);
  const currentSaved = savedOcr?.key === pageKey ? savedOcr : null;
  const checkingOcr = ocrPreference === 'synced' && !currentSaved;
  const ocrMode = ocrPreference === 'synced' ? (currentSaved?.layout ? 'synced' : checkingOcr ? 'off' : 'web') : ocrPreference;
  useEffect(() => {
    if (ocrPreference !== 'synced' || !archive || savedOcr?.key === pageKey) return;
    const controller = new AbortController();
    const check = async () => {
      try {
        if (!owner) throw new Error('No synced Android OCR is available while signed out.');
        const original = await archive.page(Math.max(0, Math.min(archive.pageCount - 1, props.currentPage - 1)));
        const layout = await loadDriveOcr(original, owner, backendFetch, () => auth.getUserId?.() === owner, controller.signal, () => {});
        if (!controller.signal.aborted) setSavedOcr({ key: pageKey, layout: layout.lines.length ? layout : null, message: layout.lines.length ? '' : 'No Android text is saved for this page. Use Web OCR to inspect an area.' });
      } catch (error) {
        if (!controller.signal.aborted) setSavedOcr({ key: pageKey, layout: null, message: error instanceof Error ? error.message : 'Could not load Android OCR.' });
      }
    };
    void check();
    return () => controller.abort();
  }, [ocrPreference, archive, owner, pageKey, props.currentPage, auth, backendFetch]);
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
  const recognize = useCallback(async (_image: Blob, signal: AbortSignal, _progress: (message: string) => void) => {
    if (ocrMode === 'web') {
      const bitmap = await createImageBitmap(_image);
      const vertical = bitmap.height > bitmap.width * 1.2;
      bitmap.close();
      // Undefined owner explicitly disables both reads and writes to the OCR cache.
      return recognizeLocalPage(_image, undefined, vertical ? 'vertical' : 'auto', signal, _progress);
    }
    if (currentSaved?.layout) return currentSaved.layout;
    throw new Error('No Android OCR is saved for this page.');
  }, [ocrMode, currentSaved]);
  if (error) return <div role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></div>;
  if (!archive || !document) return <p>Opening comic…</p>;
  const page = Math.max(1, Math.min(archive.pageCount, props.currentPage));
  const chapter = comics.store.value<Chapter>(`chapter:${recordId}`);
  const ordered = books.filter(item => item.fileType === 'cbz' && chapter?.seriesId && comics.store.value<Chapter>(`chapter:${comicId(item)}`)?.seriesId === chapter.seriesId)
    .sort((a, b) => compareChapters(comics.store.value<Chapter>(`chapter:${comicId(a)}`)!, comics.store.value<Chapter>(`chapter:${comicId(b)}`)!));
  const currentIndex = ordered.findIndex(item => comicId(item) === recordId);
  const next = currentIndex < 0 ? undefined : ordered[currentIndex + 1];
  const tools = <div ref={ocrMenuRef} className="relative" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onKeyDown={event => {
        if (event.key === 'Escape') { setOcrMenuOpen(false); ocrMenuRef.current?.querySelector('button')?.focus(); }
      }}>
        <button type="button" title="OCR settings" aria-expanded={ocrMenuOpen} onClick={() => setOcrMenuOpen(open => !open)} className="flex h-11 items-center px-3 text-xs font-semibold hover:bg-[color:var(--ui-surface-alt)]">OCR{ocrPreference !== 'off' ? ' •' : ''}</button>
                <div hidden={!ocrMenuOpen} className="absolute right-0 top-full z-30 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-4 text-sm text-[color:var(--ui-text)] shadow-xl">
          <fieldset className="space-y-3 mb-3">
            <legend className="mb-3 font-semibold">OCR settings</legend>
            {([
              ['off', 'Off', 'Read without text lookup.'],
              ['synced', 'Synced OCR', 'Use text saved by Android. This is the default.'],
              ['web', 'Web OCR', 'Drag over text to read it in this browser. Results are temporary and never saved.'],
            ] as const).map(([value, label, description]) => <label key={value} className="flex cursor-pointer items-start gap-2">
              <input type="radio" name="comic-ocr-mode" aria-label={label} value={value} checked={value === 'synced' ? ocrPreference === 'synced' && (checkingOcr || !!currentSaved?.layout) : ocrMode === value && !checkingOcr} onChange={() => chooseOcrMode(value)} className="mt-1" />
              <span><span className="block font-medium">{label}</span><span className="block text-xs text-[color:var(--ui-muted)]">{description}</span></span>
            </label>)}
          </fieldset>
          {checkingOcr && <p role="status">Checking for saved Android text…</p>}
          {ocrPreference === 'synced' && currentSaved && !currentSaved.layout && <p className="mb-2 text-xs text-[color:var(--ui-muted)]">{currentSaved.message} Web OCR is available below.</p>}
          <div ref={setOcrStatusHost} />
        </div>
      </div>;
  return <div>
    <div className="flex flex-wrap items-center gap-3 empty:hidden">
      {page === archive.pageCount && recordId && <button className="rounded border px-3 py-2" onClick={() => comics.store.edit(`progress:${recordId}`, { page, pageCount: archive.pageCount, status: 'read', updatedAt: Date.now() })}>Finish chapter</button>}
      {next && <button className="rounded border px-3 py-2" onClick={() => navigate(`/book/${next.id}`)}>Next chapter</button>}
    </div>
    {comics.pending > 0 && <p role="status">{comics.message}</p>}
    {props.ocrToolsHost ? createPortal(tools, props.ocrToolsHost) : tools}
    <PdfPageCanvas key={`${owner}:${page}:${ocrMode}`} pdf={document} pageNumber={page} documentId={props.documentId} documentVersion={props.documentVersion} showTokenHighlights={true} recognizePage={recognize} lookupEnabled={ocrMode !== 'off'} inspectArea={ocrMode === 'web'} renderLookupStatus={status => ocrMode !== 'off' && ocrStatusHost ? createPortal(status, ocrStatusHost) : null} />
  </div>;
});
