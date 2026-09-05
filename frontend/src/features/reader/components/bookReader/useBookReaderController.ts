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
  const [pdfCurrentPage, setPdfCurrentPage] = useState(initialPdfPage);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pendingBookmark, setPendingBookmark] = useState<{
    chapterIndex: number;
    position: number;
  } | null>(null);

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

  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const translation = useTranslation(bookId, chapter, currentChapterContent);
  const {
    translateCurrent,
    isTranslating,
    isTranslated,
    translatedContent,
    clearTranslation,
    applyStoredTranslation,
    isAutoloaded,
    lastUseCefr,
    setLastUseCefr,
  } = translation;

  const tts = useTextToSpeech(contentRef);

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
  });

  const { progressLoaded } = progress;

  const mix = useMixModeContent({
    bookId,
    chapter,
    isPdf,
    settings,
    currentChapterContent,
    translatedContent,
    isTranslated,
    clearTranslation,
    contentRef: contentRef as RefObject<HTMLElement>,
    openAiKeyRefreshSignal,
  });

  const highlighting = useJpdbHighlighting({
    contentRef: contentRef as RefObject<HTMLElement>,
    currentChapterContent,
    translatedContent,
    isTranslated,
    isTranslating,
    contentVersion: mix.contentVersion,
    mixEnabled: Boolean(settings?.mixEnabled),
    mixAutoEnableHighlight: Boolean(settings?.mixAutoEnableHighlight),
  });

  useGrammarReadAlong({
    contentRef: contentRef as RefObject<HTMLElement>,
    jpdbHighlighted: highlighting.jpdbHighlighted,
    isPdf,
    isTranslated,
    contentVersion: mix.contentVersion,
  });

  // Load PDF data when metadata is ready.
  useEffect(() => {
    if (!bookMetadata || bookMetadata.fileType !== "pdf" || !progressLoaded) return;

    const load = async () => {
      const blob = await downloadBook(bookId, bookMetadata);
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        setPdfData(arrayBuffer);
      }
    };

    void load();
  }, [bookMetadata, bookId, downloadBook, progressLoaded]);

  const updateChapter = progress.navigateToChapter;

  useInternalEpubLinks({
    bookId,
    isPdf,
    contentRef: contentRef as RefObject<HTMLElement>,
    bookContent,
    navigateToChapter: updateChapter,
  });

  const nextChapter = useCallback(() => {
    if (bookContent && chapter < bookContent.totalChapters - 1) {
      clearTranslation();
      updateChapter(chapter + 1);
    }
  }, [bookContent, chapter, clearTranslation, updateChapter]);

  const prevChapter = useCallback(() => {
    if (chapter > 0) {
      clearTranslation();
      updateChapter(chapter - 1);
    }
  }, [chapter, clearTranslation, updateChapter]);

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

      if (bookMetadata && progressLoaded && pdfPageCount) {
        void saveBookProgress(
          bookId,
          newPage - 1,
          0,
          newPage,
          pdfPageCount,
          "pdf"
        );
      }
    },
    [bookId, bookMetadata, pdfPageCount, progressLoaded, saveBookProgress, setSearchParams]
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
    if (settings?.verticalWriting) {
      const maxScrollLeft = Math.max(
        0,
        readingSurface.scrollWidth - readingSurface.clientWidth
      );
      return Math.round(Math.max(0, maxScrollLeft - readingSurface.scrollLeft));
    }
    return Math.round(Math.max(0, readingSurface.scrollTop));
  }, [isPdf, settings?.verticalWriting]);

  const navigateToBookmark = useCallback(
    (chapterIndex: number, position: number) => {
      if (isPdf) {
        goToPdfPage(chapterIndex + 1);
        return;
      }

      const lastChapter = Math.max(0, (bookContent?.totalChapters || 1) - 1);
      const boundedChapter = Math.min(Math.max(0, Math.trunc(chapterIndex)), lastChapter);
      setPendingBookmark({
        chapterIndex: boundedChapter,
        position: Math.max(0, Number.isFinite(position) ? position : 0),
      });
      clearTranslation();
      updateChapter(boundedChapter);
    },
    [bookContent?.totalChapters, clearTranslation, goToPdfPage, isPdf, updateChapter]
  );

  useEffect(() => {
    if (
      !pendingBookmark ||
      isPdf ||
      pendingBookmark.chapterIndex !== chapter ||
      currentChapterContentChapter !== chapter
    ) {
      return;
    }

    const restoreTimer = window.setTimeout(() => {
      const readingSurface = contentRef.current;
      if (!readingSurface) return;

      if (settings?.verticalWriting) {
        const maxScrollLeft = Math.max(
          0,
          readingSurface.scrollWidth - readingSurface.clientWidth
        );
        readingSurface.scrollLeft = Math.max(0, maxScrollLeft - pendingBookmark.position);
      } else {
        readingSurface.scrollTop = pendingBookmark.position;
      }
      setPendingBookmark(null);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [
    chapter,
    contentRef,
    currentChapterContentChapter,
    isPdf,
    mix.contentVersion,
    pendingBookmark,
    settings?.verticalWriting,
  ]);

  const rightToLeftPageTurning = Boolean(settings?.verticalWriting && !isPdf);
  const previousPage = isPdf ? prevPdfPage : prevChapter;
  const nextPage = isPdf ? nextPdfPage : nextChapter;

  useSwipe(
    contentRef as RefObject<HTMLElement>,
    rightToLeftPageTurning ? previousPage : nextPage,
    rightToLeftPageTurning ? nextPage : previousPage
  );

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
    pdf: {
      data: pdfData,
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
      getCurrentReadingPosition,
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
