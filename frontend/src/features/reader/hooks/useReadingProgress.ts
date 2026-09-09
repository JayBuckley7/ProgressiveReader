import { useCallback, useEffect, useRef, useState } from "react";

import { appLog } from "@shared/appLog";
import type { ReaderLocator } from "~/types/api";

interface ReadingProgress {
  currentChapter?: number;
  currentPosition?: number;
  currentPage?: number;
  scrollHeight?: number;
  viewportHeight?: number;
  locator?: ReaderLocator;
}

interface UseReadingProgressProps {
  bookId: string;
  bookMetadata: { fileType?: string } | null;
  chapter: number;
  verticalWriting?: boolean;
  contentRef: React.RefObject<HTMLDivElement>;
  getReadingProgress: (bookId: string) => Promise<ReadingProgress | null>;
  saveBookProgress: (
    bookId: string,
    chapter: number,
    position: number,
    currentPage?: number,
    totalPages?: number,
    fileType?: string,
    scrollHeight?: number,
    viewportHeight?: number,
    locator?: ReaderLocator
  ) => Promise<void>;
  setLocalChapter: (chapter: number) => void;
  setPdfCurrentPage: (page: number) => void;
  searchParams: URLSearchParams;
  setSearchParams: (
    params: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
    options?: { replace?: boolean }
  ) => void;
  currentChapter?: number;
  setCurrentChapter?: (chapter: number) => void;
  /** Reflow-specific bridge. Visual page numbers are deliberately not persisted. */
  paginationReady?: boolean;
  contentChapter?: number | null;
  getCurrentPosition?: () => number;
  getCurrentLocator?: () => ReaderLocator | undefined;
  restoreLocator?: (locator: ReaderLocator) => boolean;
  restoreLegacyPosition?: (
    position: number,
    savedBounds?: Pick<ReadingProgress, "scrollHeight" | "viewportHeight">
  ) => boolean;
}

export function useReadingProgress({
  bookId,
  bookMetadata,
  chapter,
  verticalWriting = false,
  contentRef,
  getReadingProgress,
  saveBookProgress,
  setLocalChapter,
  setPdfCurrentPage,
  searchParams,
  setSearchParams,
  currentChapter,
  setCurrentChapter,
  paginationReady = false,
  contentChapter,
  getCurrentPosition,
  getCurrentLocator,
  restoreLocator,
  restoreLegacyPosition,
}: UseReadingProgressProps) {
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<ReadingProgress | null>(null);
  const scrollPositionRef = useRef(0);
  const saveProgressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParamsRef = useRef(searchParams);
  const currentChapterRef = useRef(currentChapter);
  const setSearchParamsRef = useRef(setSearchParams);
  const capturePositionRef = useRef(getCurrentPosition);
  const captureLocatorRef = useRef(getCurrentLocator);
  const restoreLocatorRef = useRef(restoreLocator);
  const restoreLegacyPositionRef = useRef(restoreLegacyPosition);
  const verticalWritingRef = useRef(verticalWriting);

  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  useEffect(() => {
    capturePositionRef.current = getCurrentPosition;
    captureLocatorRef.current = getCurrentLocator;
    restoreLocatorRef.current = restoreLocator;
    restoreLegacyPositionRef.current = restoreLegacyPosition;
  }, [getCurrentLocator, getCurrentPosition, restoreLegacyPosition, restoreLocator]);

  useEffect(() => {
    verticalWritingRef.current = verticalWriting;
  }, [verticalWriting]);

  // Load once per mounted book. Reflowable content is restored only after its
  // measured layout is ready so font loading cannot shift the target sentence.
  useEffect(() => {
    if (!bookMetadata || progressLoaded) return;

    let cancelled = false;
    void (async () => {
      try {
        const saved = await getReadingProgress(bookId);
        if (cancelled || !saved) return;

        appLog.debug("[useReadingProgress] Restoring reading progress:", saved);
        const params = searchParamsRef.current;
        if (bookMetadata.fileType === 'pdf' || bookMetadata.fileType === 'cbz') {
          const savedPdfPage =
            (saved.locator?.kind === "pdf" || saved.locator?.kind === "cbz") ? saved.locator.pageNumber : saved.currentPage;
          if (!params.get("page") && savedPdfPage) {
            setPdfCurrentPage(savedPdfPage);
            const nextParams = new URLSearchParams(params);
            nextParams.delete("ch");
            nextParams.set("page", String(savedPdfPage));
            setSearchParamsRef.current(nextParams, { replace: true });
          }
          return;
        }

        // An explicit URL/controlled chapter wins over persisted progress.
        if (params.has("ch") || currentChapterRef.current !== undefined) return;

        const savedChapter =
          saved.locator?.kind === "reflow" && saved.locator.chapterIndex !== undefined
            ? saved.locator.chapterIndex
            : saved.currentChapter;
        if (savedChapter != null) {
          setLocalChapter(savedChapter);
          const nextParams = new URLSearchParams(params);
          nextParams.set("ch", String(savedChapter));
          setSearchParamsRef.current(nextParams, { replace: true });
        }
        setPendingRestore(saved);
      } catch (error) {
        appLog.error("[useReadingProgress] Failed to load reading progress", error);
      } finally {
        if (!cancelled) setProgressLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, bookMetadata, getReadingProgress, progressLoaded, setLocalChapter, setPdfCurrentPage]);

  useEffect(() => {
    if (!pendingRestore || !paginationReady || contentChapter !== chapter) return;
    const targetChapter =
      pendingRestore.locator?.kind === "reflow" &&
      pendingRestore.locator.chapterIndex !== undefined
        ? pendingRestore.locator.chapterIndex
        : pendingRestore.currentChapter;
    if (targetChapter !== undefined && targetChapter !== chapter) return;

    const frame = requestAnimationFrame(() => {
      const restored = pendingRestore.locator
        ? restoreLocatorRef.current?.(pendingRestore.locator) ?? false
        : false;
      if (!restored && pendingRestore.currentPosition !== undefined) {
        restoreLegacyPositionRef.current?.(pendingRestore.currentPosition, pendingRestore);
      }
      scrollPositionRef.current = capturePositionRef.current?.() ?? 0;
      setPendingRestore(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [chapter, contentChapter, paginationReady, pendingRestore]);

  const fileType = bookMetadata?.fileType;
  const saveProgress = useCallback(() => {
    if (!fileType || !progressLoaded || pendingRestore || ["pdf", "cbz"].includes(fileType)) return;
    const element = contentRef.current;
    const position = capturePositionRef.current?.() ?? scrollPositionRef.current;
    scrollPositionRef.current = position;
    const scrollExtent = element
      ? capturePositionRef.current || verticalWriting
        ? element.scrollWidth
        : element.scrollHeight
      : undefined;
    const viewportExtent = element
      ? capturePositionRef.current || verticalWriting
        ? element.clientWidth
        : element.clientHeight
      : undefined;
    const locator = captureLocatorRef.current?.();
    const args: Parameters<typeof saveBookProgress> = [
      bookId,
      chapter,
      position,
      undefined,
      undefined,
      fileType,
      scrollExtent,
      viewportExtent,
    ];
    if (locator) args.push(locator);
    void saveBookProgress(...args);
  }, [
    bookId,
    chapter,
    contentRef,
    fileType,
    pendingRestore,
    progressLoaded,
    saveBookProgress,
    verticalWriting,
  ]);

  const saveProgressRef = useRef(saveProgress);
  useEffect(() => {
    saveProgressRef.current = saveProgress;
  }, [saveProgress]);

  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    scrollPositionRef.current = capturePositionRef.current?.() ?? (
      verticalWritingRef.current
        ? Math.max(
            0,
            contentRef.current.scrollWidth -
              contentRef.current.clientWidth -
              contentRef.current.scrollLeft
          )
        : contentRef.current.scrollTop
    );
    if (saveProgressTimeoutRef.current) clearTimeout(saveProgressTimeoutRef.current);
    saveProgressTimeoutRef.current = setTimeout(() => saveProgressRef.current(), 5_000);
  }, [contentRef]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      content.removeEventListener("scroll", handleScroll);
      if (saveProgressTimeoutRef.current) clearTimeout(saveProgressTimeoutRef.current);
    };
  }, [contentRef, handleScroll]);

  // Persist the chapter being left and the final location on unmount.
  useEffect(() => {
    return () => {
      if (saveProgressTimeoutRef.current) clearTimeout(saveProgressTimeoutRef.current);
      saveProgressRef.current();
    };
  }, [chapter]);

  const navigateToChapter = useCallback(
    (nextChapter: number) => {
      if (saveProgressTimeoutRef.current) clearTimeout(saveProgressTimeoutRef.current);
      saveProgressRef.current();
      scrollPositionRef.current = 0;

      if (setCurrentChapter) {
        setCurrentChapter(nextChapter);
        return;
      }

      setLocalChapter(nextChapter);
      const nextParams = new URLSearchParams(searchParamsRef.current);
      nextParams.set("ch", String(nextChapter));
      nextParams.delete("page");
      setSearchParamsRef.current(nextParams, { replace: true });
    },
    [setCurrentChapter, setLocalChapter]
  );

  return {
    progressLoaded,
    scrollPositionRef,
    saveProgressTimeoutRef,
    saveProgress,
    navigateToChapter,
  };
}
