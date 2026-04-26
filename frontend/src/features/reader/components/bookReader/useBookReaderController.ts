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

import { PdfViewerHandle } from "@shared/components/PdfViewer";

import { useInternalEpubLinks } from "./useInternalEpubLinks";
import { useJpdbHighlighting } from "./useJpdbHighlighting";
import { useMixModeContent } from "./useMixModeContent";

interface UseBookReaderControllerProps {
  bookId: string;
  currentChapter?: number;
  setCurrentChapter?: (chapter: number) => void;
  onBack?: () => void;
  openAiKeyRefreshSignal: unknown;
}

export function useBookReaderController({
  bookId,
  currentChapter,
  setCurrentChapter,
  onBack,
  openAiKeyRefreshSignal,
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
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(initialPdfPage);
  const [pdfPageCount, setPdfPageCount] = useState(0);

  const [localChapter, setLocalChapter] = useState(() => {
    const fromQuery = parseInt(searchParams.get("ch") || "0", 10);
    return currentChapter ?? fromQuery;
  });
  const chapter = currentChapter ?? localChapter;

  // Hooks must be called before any conditional returns.
  const { bookContent, currentChapterContent, isLoading, error } = useBookContent(bookId, chapter);

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
        setPdfLoaded(true);
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

  // PDF page navigation handlers
  const nextPdfPage = useCallback(() => {
    if (pdfPageCount && pdfCurrentPage < pdfPageCount) {
      const newPage = pdfCurrentPage + 1;
      setPdfCurrentPage(newPage);

      // Save progress when PDF page changes.
      if (bookMetadata && progressLoaded) {
        saveBookProgress(
          bookId,
          newPage - 1, // Use 0-based chapter for consistency
          0,
          newPage,
          pdfPageCount,
          "pdf"
        );
      }
    }
  }, [bookId, bookMetadata, pdfCurrentPage, pdfPageCount, progressLoaded, saveBookProgress]);

  const prevPdfPage = useCallback(() => {
    if (pdfCurrentPage > 1) {
      const newPage = pdfCurrentPage - 1;
      setPdfCurrentPage(newPage);

      // Save progress when PDF page changes.
      if (bookMetadata && progressLoaded) {
        saveBookProgress(
          bookId,
          newPage - 1, // Use 0-based chapter for consistency
          0,
          newPage,
          pdfPageCount,
          "pdf"
        );
      }
    }
  }, [bookId, bookMetadata, pdfCurrentPage, pdfPageCount, progressLoaded, saveBookProgress]);

  useSwipe(
    contentRef as RefObject<HTMLElement>,
    isPdf ? nextPdfPage : nextChapter,
    isPdf ? prevPdfPage : prevChapter
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
    pdf: {
      data: pdfData,
      viewerRef: pdfViewerRef,
      currentPage: pdfCurrentPage,
      setCurrentPage: setPdfCurrentPage,
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
