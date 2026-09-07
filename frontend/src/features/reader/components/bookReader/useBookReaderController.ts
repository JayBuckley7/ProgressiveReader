import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useSettings } from "@shared/contexts/SettingsContext";
import { useAppData } from "@shared/contexts/AppDataContext";

import { useBookContent } from "@features/reader/hooks/useBookContent";
import { useReadingProgress } from "@features/reader/hooks/useReadingProgress";
import { useSwipe } from "@features/reader/hooks/useSwipe";
import { useTextToSpeech } from "@features/reader/hooks/useTextToSpeech";
import { useTranslation } from "@features/reader/hooks/useTranslation";
import { useGrammarReadAlong } from "@features/grammar/hooks/useGrammarReadAlong";

import type { PdfViewerHandle } from "@shared/components/PdfViewer";

import { useInternalEpubLinks } from "./useInternalEpubLinks";
import { useJpdbHighlighting } from "./useJpdbHighlighting";
import { useMixModeContent } from "./useMixModeContent";
import {
  annotateChapterHtml,
  reflowAnchorForElement,
  useReflowPagination,
  type PaginationState,
} from "@features/reader/pagination";
import type { ReaderLocator } from "~/types/api";

interface UseBookReaderControllerProps {
  bookId: string;
  currentChapter?: number;
  setCurrentChapter?: (chapter: number) => void;
  onBack?: () => void;
  openAiKeyRefreshSignal: unknown;
  keyboardNavigationEnabled?: boolean;
}

export function useBookReaderController({
  bookId,
  currentChapter,
  setCurrentChapter,
  onBack,
  openAiKeyRefreshSignal,
  keyboardNavigationEnabled = true,
}: UseBookReaderControllerProps) {
  const navigate = useNavigate();
  const { books, downloadBook, getReadingProgress, saveBookProgress } = useAppData();
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();

  const bookMetadata = useMemo(() => books.find((b) => b.id === bookId) ?? null, [books, bookId]);
  const isPdf = bookMetadata?.fileType === "pdf";

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    // The UI label is "Back to Library". In mobile webviews / deep links there may be no
    // meaningful in-app history to navigate back to.
    navigate("/", { replace: true });
  }, [navigate, onBack]);

  // Handle initial PDF page from URL
  const initialPdfPage = useMemo(() => {
    const pageFromQuery = parseInt(searchParams.get("page") || "1", 10);
    return Math.max(1, pageFromQuery);
  }, [searchParams]);

  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [pdfLoadRetryEpoch, setPdfLoadRetryEpoch] = useState(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(initialPdfPage);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const loadedPdfIdentityRef = useRef<string | null>(null);
  const inFlightPdfLoadRef = useRef<{
    identity: string;
    promise: Promise<ArrayBuffer>;
  } | null>(null);
  const [pendingBookmark, setPendingBookmark] = useState<{
    chapterIndex: number;
    position: number;
    locator?: ReaderLocator;
  } | null>(null);
  const [pageWindow, setPageWindow] = useState<{
    current: string[];
    next: string[];
    layoutVersion: number;
  }>({
    current: [],
    next: [],
    layoutVersion: -1,
  });
  const paginationLayoutRef = useRef<{ ready: boolean; version: number }>({
    ready: false,
    version: -1,
  });
  const getPaginationLayoutSnapshot = useCallback(
    () => paginationLayoutRef.current,
    []
  );
  const pendingChapterLandingRef = useRef<"start" | "end" | null>(null);
  const pendingInternalFragmentRef = useRef<string | null>(null);

  const [localChapter, setLocalChapter] = useState(() => {
    const fromQuery = parseInt(searchParams.get("ch") || "0", 10);
    return currentChapter ?? fromQuery;
  });
  const chapter = currentChapter ?? localChapter;

  // Hooks must be called before any conditional returns.
  const {
    bookContent,
    currentChapterContent,
    currentChapterContentChapter,
    isLoading,
    error,
  } = useBookContent(bookId, chapter);
  // useEffect-driven chapter loading leaves the previous chapter value in the
  // render immediately after navigation. Never annotate or dispatch work for
  // that stale value under the new chapter/cache identity.
  const activeChapterContent =
    currentChapterContentChapter === chapter ? currentChapterContent : null;

  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);

  const annotatedChapter = useMemo(() => {
    if (!activeChapterContent || isPdf) return null;
    return annotateChapterHtml(activeChapterContent, {
      bookId,
      chapter,
    });
  }, [activeChapterContent, bookId, chapter, isPdf]);

  const pageTranslationOptions = useMemo(
    () =>
      annotatedChapter
        ? {
            annotatedHtml: annotatedChapter.html,
            // Oversized atomic/preformatted/table roots stay in the semantic
            // DOM for reading, locators, and highlighting, but never enter a
            // paid model request that cannot be bounded safely.
            segments: annotatedChapter.segments.filter(
              (segment) => segment.translationPolicy === "translate"
            ),
            pageWindow: { current: pageWindow.current, next: pageWindow.next },
            layoutVersion: pageWindow.layoutVersion,
            getLayoutSnapshot: getPaginationLayoutSnapshot,
            composeTranslatedHtml: false,
          }
        : undefined,
    [annotatedChapter, getPaginationLayoutSnapshot, pageWindow]
  );

  const translation = useTranslation(
    bookId,
    chapter,
    isPdf ? null : activeChapterContent,
    isPdf ? undefined : pageTranslationOptions
  );
  const {
    translateCurrent,
    isTranslating,
    isTranslated,
    translatedContent,
    segmentTranslations,
    segmentedTranslationActive,
    clearTranslation,
    applyStoredTranslation,
    isAutoloaded,
    lastUseCefr,
    setLastUseCefr,
  } = translation;

  const mix = useMixModeContent({
    bookId,
    chapter,
    isPdf,
    settings,
    currentChapterContent: annotatedChapter?.html ?? activeChapterContent,
    translatedContent,
    segmentTranslations,
    segmentedTranslationActive,
    isTranslated,
    clearTranslation,
    contentRef: flowRef as RefObject<HTMLElement>,
    openAiKeyRefreshSignal,
    currentSegmentIds: pageWindow.current,
    nextSegmentIds: pageWindow.next,
  });

  const pagination = useReflowPagination({
    viewportRef: contentRef as RefObject<HTMLElement>,
    contentRef: flowRef as RefObject<HTMLElement>,
    mode: settings?.verticalWriting ? "vertical-rl" : "horizontal-columns",
    enabled: !isPdf && Boolean(annotatedChapter),
    columnGap: 28,
    contentVersion: `${bookId}:${chapter}:${mix.contentVersion}:${settings?.fontSize || 16}:${settings?.fontFamily || "Inter"}`,
  });
  paginationLayoutRef.current = {
    ready: pagination.isLayoutReady,
    version: pagination.layoutRevision,
  };

  useEffect(() => {
    // Reflow intentionally marks its geometry stale while a page-scoped DOM
    // update is being measured. Keep the last settled window during that brief
    // interval; replacing it with an empty scope would undo the update and
    // create a translate/mix -> reflow -> restore loop.
    if (!pagination.isLayoutReady) return;
    const current = pagination.currentSegmentIds;
    const next = pagination.nextSegmentIds;
    setPageWindow((existing) => {
      const sameCurrent =
        existing.current.length === current.length &&
        existing.current.every((id, index) => id === current[index]);
      const sameNext =
        existing.next.length === next.length &&
        existing.next.every((id, index) => id === next[index]);
      return sameCurrent && sameNext && existing.layoutVersion === pagination.layoutRevision
        ? existing
        : {
            // Keep array identity stable when a DOM-only reflow produces the
            // same page window. Highlighting changes the DOM itself, and a new
            // array here would otherwise restart that work unnecessarily.
            current: sameCurrent ? existing.current : current,
            next: sameNext ? existing.next : next,
            layoutVersion: pagination.layoutRevision,
          };
    });
  }, [
    pagination.currentSegmentIds,
    pagination.isLayoutReady,
    pagination.nextSegmentIds,
    pagination.layoutRevision,
  ]);

  const highlighting = useJpdbHighlighting({
    contentRef: flowRef as RefObject<HTMLElement>,
    currentChapterContent: activeChapterContent,
    translatedContent,
    isTranslated,
    isTranslating,
    contentVersion: mix.contentVersion,
    mixEnabled: Boolean(settings?.mixEnabled),
    mixAutoEnableHighlight: Boolean(settings?.mixAutoEnableHighlight),
    // Reflow deliberately becomes temporarily unready while JPDB wrappers are
    // inserted. Use the last settled page window so that transient empty
    // pagination arrays cannot tell the highlighter to remove its own work.
    currentSegmentIds: pageWindow.current,
    nextSegmentIds: pageWindow.next,
  });

  useGrammarReadAlong({
    contentRef: flowRef as RefObject<HTMLElement>,
    viewportRef: contentRef as RefObject<HTMLElement>,
    visibleSegmentIds: pagination.currentSegmentIds,
    pageIdentity: pagination.pageIndex,
    jpdbHighlighted: highlighting.jpdbHighlighted,
    isPdf,
    isTranslated,
    contentVersion: mix.contentVersion,
  });

  const goToPdfPage = useCallback(
    (requestedPage: number) => {
      if (!Number.isFinite(requestedPage)) return;
      const wholePage = Math.trunc(requestedPage);
      const newPage = Math.min(Math.max(1, wholePage), pdfPageCount || Math.max(1, wholePage));

      setPdfCurrentPage(newPage);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("ch");
          next.set("page", String(newPage));
          return next;
        },
        { replace: true }
      );

      if (bookMetadata && pdfPageCount) {
        void saveBookProgress(
          bookId,
          newPage - 1,
          0,
          newPage,
          pdfPageCount,
          "pdf",
          undefined,
          undefined,
          { version: 2, kind: "pdf", pageNumber: newPage }
        );
      }
    },
    [bookId, bookMetadata, pdfPageCount, saveBookProgress, setSearchParams]
  );

  const nextPdfPage = useCallback(() => {
    if (pdfPageCount && pdfCurrentPage < pdfPageCount) {
      goToPdfPage(pdfCurrentPage + 1);
    }
  }, [goToPdfPage, pdfCurrentPage, pdfPageCount]);

  const prevPdfPage = useCallback(() => {
    if (pdfCurrentPage > 1) {
      goToPdfPage(pdfCurrentPage - 1);
    }
  }, [goToPdfPage, pdfCurrentPage]);

  useEffect(() => {
    if (!isPdf) return;
    const pageParam = searchParams.get("page");
    if (!pageParam) return;
    const requestedPage = Number.parseInt(pageParam, 10);
    const boundedPage = Math.min(
      Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1),
      pdfPageCount || Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1)
    );
    setPdfCurrentPage((currentPage) =>
      currentPage === boundedPage ? currentPage : boundedPage
    );
  }, [isPdf, pdfPageCount, searchParams]);

  const getCurrentReadingPosition = useCallback(() => {
    const readingSurface = contentRef.current;
    if (!readingSurface || isPdf) return 0;
    if (!pagination.isLayoutReady) {
      return Math.round(
        Math.max(
          0,
          settings?.verticalWriting
            ? readingSurface.scrollWidth -
                readingSurface.clientWidth -
                readingSurface.scrollLeft
            : readingSurface.scrollTop
        )
      );
    }
    const legacyStride = readingSurface.clientWidth;
    return Math.round(Math.max(0, pagination.pageIndex * Math.max(1, legacyStride)));
  }, [isPdf, pagination.isLayoutReady, pagination.pageIndex, settings?.verticalWriting]);

  const getCurrentReadingLocator = useCallback((): ReaderLocator | undefined => {
    if (isPdf) {
      return { version: 2, kind: "pdf", pageNumber: pdfCurrentPage };
    }
    const anchor = pagination.captureAnchor();
    if (!anchor || !annotatedChapter) return undefined;
    const segment = annotatedChapter.segments.find((item) => item.id === anchor.segmentId);
    const liveSegment = flowRef.current
      ? Array.from(flowRef.current.querySelectorAll<HTMLElement>("[data-pr-segment-id]"))
          .find((element) => element.dataset.prSegmentId === anchor.segmentId)
      : undefined;
    const totalCodePoints = Math.max(1, annotatedChapter.segments.at(-1)?.sourceEnd || 1);
    const progression = segment
      ? Math.min(
          1,
          Math.max(0, (segment.sourceStart + anchor.textOffset) / totalCodePoints)
        )
      : Math.min(
          1,
          Math.max(0, pagination.pageIndex / Math.max(1, pagination.pageCount - 1))
        );
    // An unaligned legacy translation has synthetic IDs unrelated to the
    // source chapter. Keep a quote from the live rendered segment and use the
    // visual progression as the honest fallback instead of treating its text
    // offset as an original-source coordinate.
    const sourceText = Array.from(segment?.text || liveSegment?.textContent || "");
    const quoteStart = Math.max(0, anchor.textOffset - 24);
    const quote = sourceText.slice(quoteStart, quoteStart + 64).join("") || undefined;
    return {
      version: 2,
      kind: "reflow",
      chapterIndex: chapter,
      segmentId: anchor.segmentId,
      textOffset: anchor.textOffset,
      quote,
      progression,
    };
  }, [annotatedChapter, chapter, isPdf, pagination, pdfCurrentPage]);

  const restoreReadingLocator = useCallback(
    (locator: ReaderLocator): boolean => {
      if (locator.kind === "pdf" && locator.pageNumber) {
        goToPdfPage(locator.pageNumber);
        return true;
      }
      if (locator.kind !== "reflow" || !flowRef.current) return false;

      let segmentId = locator.segmentId;
      let textOffset = locator.textOffset || 0;
      let segment = segmentId
        ? Array.from(flowRef.current.querySelectorAll<HTMLElement>("[data-pr-segment-id]"))
            .find((element) => element.dataset.prSegmentId === segmentId)
        : undefined;
      if (!segment && locator.quote) {
        segment = Array.from(
          flowRef.current.querySelectorAll<HTMLElement>("[data-pr-segment-id]")
        ).find((element) => (element.textContent || "").includes(locator.quote || ""));
        segmentId = segment?.dataset.prSegmentId;
        textOffset = segment
          ? Math.max(
              0,
              Array.from(segment.textContent || "").join("").indexOf(locator.quote) +
                Math.min(24, locator.textOffset || 0)
            )
          : 0;
      }
      if (segment && segmentId) {
        pagination.restoreAnchor({ segmentId, textOffset });
        return true;
      }
      if (typeof locator.progression === "number") {
        pagination.goToPage(Math.round(locator.progression * Math.max(0, pagination.pageCount - 1)));
        return true;
      }
      return false;
    },
    [goToPdfPage, pagination]
  );

  const restoreLegacyPosition = useCallback(
    (
      position: number,
      savedBounds?: { scrollHeight?: number; viewportHeight?: number }
    ): boolean => {
      const surface = contentRef.current;
      if (!surface) return false;
      if (pagination.isLayoutReady && surface.clientWidth) {
        const savedScrollableExtent = Math.max(
          0,
          (savedBounds?.scrollHeight ?? 0) - (savedBounds?.viewportHeight ?? 0)
        );
        const targetPage = savedScrollableExtent > 0
          ? Math.round(
              Math.min(1, Math.max(0, position / savedScrollableExtent)) *
                Math.max(0, pagination.pageCount - 1)
            )
          : Math.round(Math.max(0, position) / surface.clientWidth);
        pagination.goToPage(targetPage);
      } else if (settings?.verticalWriting) {
        surface.scrollLeft = Math.max(
          0,
          surface.scrollWidth - surface.clientWidth - Math.max(0, position)
        );
      } else {
        surface.scrollTop = Math.max(0, position);
      }
      return true;
    },
    [pagination.goToPage, pagination.isLayoutReady, settings?.verticalWriting]
  );

  const progress = useReadingProgress({
    bookId,
    bookMetadata,
    chapter,
    verticalWriting: Boolean(settings?.verticalWriting && !isPdf),
    contentRef: contentRef as RefObject<HTMLDivElement>,
    getReadingProgress,
    saveBookProgress,
    setLocalChapter,
    setPdfCurrentPage,
    searchParams,
    setSearchParams,
    currentChapter,
    setCurrentChapter,
    paginationReady: isPdf || pagination.isLayoutReady,
    contentChapter: currentChapterContentChapter,
    getCurrentPosition: getCurrentReadingPosition,
    getCurrentLocator: getCurrentReadingLocator,
    restoreLocator: restoreReadingLocator,
    restoreLegacyPosition,
  });
  const { progressLoaded } = progress;

  const pdfByteIdentity = useMemo(() => {
    if (!bookMetadata || bookMetadata.fileType !== "pdf") return null;
    return JSON.stringify([
      bookId,
      bookMetadata.cloudProvider,
      bookMetadata.driveFileId ?? "",
      bookMetadata.onedriveFileId ?? "",
      bookMetadata.icloudFileId ?? "",
      bookMetadata.modifiedTime ?? "",
    ]);
  }, [bookId, bookMetadata]);
  const latestBookMetadataRef = useRef(bookMetadata);
  useEffect(() => {
    latestBookMetadataRef.current = bookMetadata;
  }, [bookMetadata]);

  // Load PDF bytes after persisted page state has been restored.
  useEffect(() => {
    if (!pdfByteIdentity || !progressLoaded) return;
    if (loadedPdfIdentityRef.current === pdfByteIdentity) return;

    let cancelled = false;
    setPdfLoadError(null);
    setPdfData(null);

    let activeLoad = inFlightPdfLoadRef.current;
    if (!activeLoad || activeLoad.identity !== pdfByteIdentity) {
      const metadataForDownload = latestBookMetadataRef.current;
      if (!metadataForDownload || metadataForDownload.fileType !== "pdf") return;
      const promise = (async () => {
        const blob = await downloadBook(bookId, metadataForDownload);
        if (!blob) throw new Error("The PDF could not be downloaded.");
        return blob.arrayBuffer();
      })();
      activeLoad = { identity: pdfByteIdentity, promise };
      inFlightPdfLoadRef.current = activeLoad;
    }

    const load = activeLoad;
    void (async () => {
      try {
        const bytes = await load.promise;
        if (cancelled) return;
        loadedPdfIdentityRef.current = pdfByteIdentity;
        setPdfData(bytes);
      } catch (error) {
        if (cancelled) return;
        loadedPdfIdentityRef.current = null;
        setPdfData(null);
        setPdfLoadError(
          error instanceof Error && error.message.trim()
            ? error.message
            : "The PDF could not be loaded."
        );
      } finally {
        if (inFlightPdfLoadRef.current === load) inFlightPdfLoadRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    bookId,
    downloadBook,
    pdfByteIdentity,
    pdfLoadRetryEpoch,
    progressLoaded,
  ]);

  useEffect(() => {
    if (pdfByteIdentity) return;
    loadedPdfIdentityRef.current = null;
    inFlightPdfLoadRef.current = null;
    setPdfData(null);
    setPdfLoadError(null);
  }, [pdfByteIdentity]);

  const retryPdfLoad = useCallback(() => {
    loadedPdfIdentityRef.current = null;
    setPdfLoadError(null);
    setPdfLoadRetryEpoch((epoch) => epoch + 1);
  }, []);

  const updateChapter = useCallback(
    (targetChapter: number, landing: "start" | "end" = "start") => {
      pendingInternalFragmentRef.current = null;
      if (targetChapter === chapter) {
        if (pagination.isLayoutReady) {
          pendingChapterLandingRef.current = null;
          pagination.goToPage(landing === "end" ? pagination.pageCount - 1 : 0);
        } else {
          pendingChapterLandingRef.current = landing;
        }
        return;
      }
      pendingChapterLandingRef.current = landing;
      progress.navigateToChapter(targetChapter);
    },
    [
      chapter,
      pagination.goToPage,
      pagination.isLayoutReady,
      pagination.pageCount,
      progress.navigateToChapter,
    ]
  );

  const revealInternalElement = useCallback((element: HTMLElement) => {
    const content = flowRef.current;
    if (!content) return false;
    const anchor = reflowAnchorForElement(content, element);
    if (!anchor) return false;
    pagination.restoreAnchor(anchor);
    return true;
  }, [pagination.restoreAnchor]);

  const navigateInternalChapter = useCallback((targetChapter: number, fragmentId?: string) => {
    if (fragmentId && targetChapter === chapter) {
      const target = Array.from(flowRef.current?.querySelectorAll<HTMLElement>("[id]") ?? [])
        .find((element) => element.id === fragmentId);
      if (target && revealInternalElement(target)) return;
    }
    updateChapter(targetChapter);
    pendingInternalFragmentRef.current = fragmentId || null;
    if (fragmentId) pendingChapterLandingRef.current = null;
  }, [chapter, revealInternalElement, updateChapter]);

  useInternalEpubLinks({
    bookId,
    isPdf,
    contentRef: flowRef as RefObject<HTMLElement>,
    bookContent,
    navigateToChapter: navigateInternalChapter,
    revealElement: revealInternalElement,
  });

  const nextChapter = useCallback(() => {
    if (bookContent && chapter < bookContent.totalChapters - 1) {
      updateChapter(chapter + 1);
    }
  }, [bookContent, chapter, updateChapter]);

  const prevChapter = useCallback(() => {
    if (chapter > 0) updateChapter(chapter - 1, "end");
  }, [chapter, updateChapter]);

  useEffect(() => {
    if (
      isPdf ||
      !pagination.isLayoutReady ||
      currentChapterContentChapter !== chapter ||
      !pendingChapterLandingRef.current
    ) {
      return;
    }
    pagination.goToPage(
      pendingChapterLandingRef.current === "end" ? pagination.pageCount - 1 : 0
    );
    pendingChapterLandingRef.current = null;
  }, [
    chapter,
    currentChapterContentChapter,
    isPdf,
    pagination.goToPage,
    pagination.isLayoutReady,
    pagination.pageCount,
  ]);

  useEffect(() => {
    const fragmentId = pendingInternalFragmentRef.current;
    const content = flowRef.current;
    if (
      !fragmentId ||
      isPdf ||
      !pagination.isLayoutReady ||
      currentChapterContentChapter !== chapter ||
      !content
    ) {
      return;
    }
    const target = Array.from(content.querySelectorAll<HTMLElement>("[id]"))
      .find((element) => element.id === fragmentId);
    pendingInternalFragmentRef.current = null;
    if (target) revealInternalElement(target);
  }, [
    chapter,
    currentChapterContentChapter,
    isPdf,
    pagination.isLayoutReady,
    revealInternalElement,
  ]);

  const navigateToBookmark = useCallback(
    (chapterIndex: number, position: number, locator?: ReaderLocator) => {
      pendingInternalFragmentRef.current = null;
      if (isPdf) {
        if (!locator || !restoreReadingLocator(locator)) goToPdfPage(chapterIndex + 1);
        return;
      }

      const lastChapter = Math.max(0, (bookContent?.totalChapters || 1) - 1);
      const boundedChapter = Math.min(Math.max(0, Math.trunc(chapterIndex)), lastChapter);
      setPendingBookmark({
        chapterIndex: boundedChapter,
        position: Math.max(0, Number.isFinite(position) ? position : 0),
        locator,
      });
      pendingChapterLandingRef.current = null;
      if (boundedChapter !== chapter) progress.navigateToChapter(boundedChapter);
    },
    [
      bookContent?.totalChapters,
      chapter,
      goToPdfPage,
      isPdf,
      progress.navigateToChapter,
      restoreReadingLocator,
    ]
  );

  useEffect(() => {
    if (
      !pendingBookmark ||
      isPdf ||
      !pagination.isLayoutReady ||
      pendingBookmark.chapterIndex !== chapter ||
      currentChapterContentChapter !== chapter
    ) {
      return;
    }

    const restoreTimer = window.setTimeout(() => {
      const readingSurface = contentRef.current;
      if (!readingSurface) return;

      const restored = pendingBookmark.locator
        ? restoreReadingLocator(pendingBookmark.locator)
        : false;
      if (!restored) restoreLegacyPosition(pendingBookmark.position);
      setPendingBookmark(null);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [
    chapter,
    contentRef,
    currentChapterContentChapter,
    isPdf,
    mix.contentVersion,
    pagination.isLayoutReady,
    pendingBookmark,
    restoreLegacyPosition,
    restoreReadingLocator,
  ]);

  const previousReflowPage = useCallback(() => {
    if (!pagination.isLayoutReady) return;
    if (pagination.canGoPrevious) pagination.previousPage();
    else prevChapter();
  }, [pagination.canGoPrevious, pagination.isLayoutReady, pagination.previousPage, prevChapter]);

  const nextReflowPage = useCallback(() => {
    if (!pagination.isLayoutReady) return;
    if (pagination.canGoNext) pagination.nextPage();
    else nextChapter();
  }, [nextChapter, pagination.canGoNext, pagination.isLayoutReady, pagination.nextPage]);

  const rightToLeftPageTurning = Boolean(settings?.verticalWriting && !isPdf);
  const previousPage = isPdf ? prevPdfPage : previousReflowPage;
  const nextPage = isPdf ? nextPdfPage : nextReflowPage;
  const canPrevious = isPdf
    ? pdfCurrentPage > 1
    : pagination.isLayoutReady && (pagination.canGoPrevious || chapter > 0);
  const canNext = isPdf
    ? Boolean(pdfPageCount && pdfCurrentPage < pdfPageCount)
    : pagination.isLayoutReady && (
        pagination.canGoNext || Boolean(bookContent && chapter < bookContent.totalChapters - 1)
      );
  const paginationState: PaginationState = {
    pageIndex: isPdf ? Math.max(0, pdfCurrentPage - 1) : pagination.pageIndex,
    pageCount: isPdf ? Math.max(1, pdfPageCount) : pagination.pageCount,
    chapterIndex: chapter,
    chapterCount: Math.max(1, bookContent?.totalChapters || 1),
    isLayoutReady: isPdf ? Boolean(pdfPageCount) : pagination.isLayoutReady,
    canPrevious,
    canNext,
    currentSegmentIds: isPdf ? [] : pagination.currentSegmentIds,
    nextSegmentIds: isPdf ? [] : pagination.nextSegmentIds,
  };

  useSwipe(
    contentRef as RefObject<HTMLElement>,
    rightToLeftPageTurning ? previousPage : nextPage,
    rightToLeftPageTurning ? nextPage : previousPage,
    72,
    !isPdf && pagination.isLayoutReady
  );

  // Trackpads and mouse wheels turn a complete page, using the same boundary
  // behavior as buttons, keys, and swipes.
  useEffect(() => {
    const surface = contentRef.current;
    if (!surface || isPdf) return;
    let accumulatedDelta = 0;
    let pageTurnedForGesture = false;
    let gestureEndTimer: number | undefined;
    const handleWheel = (event: WheelEvent) => {
      const localScroller = event.target instanceof Element
        ? event.target.closest<HTMLElement>("pre, table, [data-reader-local-scroll]")
        : null;
      const localCanConsume = localScroller
        ? Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? localScroller.scrollWidth > localScroller.clientWidth &&
            (event.deltaX < 0
              ? localScroller.scrollLeft > 0
              : localScroller.scrollLeft < localScroller.scrollWidth - localScroller.clientWidth)
          : localScroller.scrollHeight > localScroller.clientHeight &&
            (event.deltaY < 0
              ? localScroller.scrollTop > 0
              : localScroller.scrollTop < localScroller.scrollHeight - localScroller.clientHeight)
        : false;
      if (
        event.ctrlKey ||
        localCanConsume ||
        document.querySelector("[role='dialog'], [data-jpdb-popup]") ||
        !document.getSelection()?.isCollapsed
      ) {
        return;
      }

      // A trackpad swipe is a burst of wheel events, including a long momentum
      // tail. Consume the entire burst and allow exactly one page turn. A fixed
      // post-navigation lock eventually expires while momentum is still being
      // emitted, which can otherwise race through several pages or chapters.
      event.preventDefault();
      if (gestureEndTimer !== undefined) window.clearTimeout(gestureEndTimer);
      gestureEndTimer = window.setTimeout(() => {
        accumulatedDelta = 0;
        pageTurnedForGesture = false;
      }, 320);
      if (pageTurnedForGesture) return;

      const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? Math.max(1, surface.clientHeight)
          : 1;
      accumulatedDelta += rawDelta * deltaScale;
      if (Math.abs(accumulatedDelta) < 32) return;

      if (accumulatedDelta > 0) nextPage();
      else previousPage();
      pageTurnedForGesture = true;
    };
    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      surface.removeEventListener("wheel", handleWheel);
      if (gestureEndTimer !== undefined) window.clearTimeout(gestureEndTimer);
    };
  }, [contentRef, isPdf, nextPage, previousPage]);

  useEffect(() => {
    if (!keyboardNavigationEnabled) return;

    const handlePageTurnKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return;
      }

      const target = event.target;
      if (
        (target instanceof HTMLElement && target.isContentEditable) ||
        (target instanceof Element &&
          Boolean(target.closest("input, textarea, select, [role='dialog'], [data-jpdb-popup]"))) ||
        document.querySelector("[role='dialog'], [data-jpdb-popup]")
      ) {
        return;
      }

      event.preventDefault();
      if (event.key === "ArrowLeft") {
        (rightToLeftPageTurning ? nextPage : previousPage)();
      } else {
        (rightToLeftPageTurning ? previousPage : nextPage)();
      }
    };

    window.addEventListener("keydown", handlePageTurnKey);
    return () => window.removeEventListener("keydown", handlePageTurnKey);
  }, [keyboardNavigationEnabled, nextPage, previousPage, rightToLeftPageTurning]);

  const tts = useTextToSpeech(
    isPdf ? contentRef : flowRef,
    isPdf
      ? undefined
      : {
          visibleSegmentIds: pagination.currentSegmentIds,
          pageIdentity: `${pagination.pageIndex}:${mix.getSegmentContentIdentity(
            pagination.currentSegmentIds
          )}`,
          pageReady:
            pagination.isLayoutReady &&
            currentChapterContentChapter === chapter &&
            !isLoading,
          onAdvancePage: canNext ? nextPage : undefined,
        }
  );

  return {
    handleBack,
    settings,
    bookMetadata,
    isPdf,
    chapter,
    bookContent,
    isLoading,
    error,
    contentRef,
    flowRef,
    pagination,
    paginationState,
    pdf: {
      data: pdfData,
      loadError: pdfLoadError,
      retryLoad: retryPdfLoad,
      viewerRef: pdfViewerRef,
      currentPage: pdfCurrentPage,
      setCurrentPage: goToPdfPage,
      pageCount: pdfPageCount,
      setPageCount: setPdfPageCount,
      nextPage: nextPdfPage,
      prevPage: prevPdfPage,
    },
    progress,
    translation,
    tts,
    mix,
    highlighting,
    nav: {
      updateChapter,
      nextChapter,
      prevChapter,
      previousPage,
      nextPage,
      canPrevious,
      canNext,
      getCurrentReadingPosition,
      getCurrentReadingLocator,
      restoreReadingLocator,
      navigateToBookmark,
    },
    controls: {
      applyStoredTranslation,
      clearTranslation,
      translateCurrent,
      isTranslating,
      isTranslated,
      isAutoloaded,
      lastUseCefr,
      setLastUseCefr,
    },
  };
}
