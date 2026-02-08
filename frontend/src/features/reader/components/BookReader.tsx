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
import { SettingsModal } from "@shared/components/SettingsModal";
import { TtsControlModal } from "@shared/components/TtsControlModal";

import { BookContent } from "./BookContent";
import { MixSettingsModal } from "./MixSettingsModal";
import { ReaderControls } from "./ReaderControls";
import { ReaderHeader } from "./ReaderHeader";
import { useInternalEpubLinks } from "./bookReader/useInternalEpubLinks";
import { useJpdbHighlighting } from "./bookReader/useJpdbHighlighting";
import { useMixModeContent } from "./bookReader/useMixModeContent";

interface BookReaderProps {
  bookId: string;
  currentChapter?: number;
  setCurrentChapter?: (chapter: number) => void;
  onBack?: () => void;
}

export function BookReader({ bookId, currentChapter, setCurrentChapter, onBack }: BookReaderProps) {
  const navigate = useNavigate();
  const { books, downloadBook, getReadingProgress, saveBookProgress } = useAppData();
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();

  const bookMetadata = useMemo(() => books.find((b) => b.id === bookId), [books, bookId]);

  // Handle initial PDF page from URL
  const initialPdfPage = useMemo(() => {
    const pageFromQuery = parseInt(searchParams.get("page") || "1", 10);
    return Math.max(1, pageFromQuery);
  }, [searchParams]);

  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(initialPdfPage);
  const [pdfPageCount, setPdfPageCount] = useState(0);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    // The UI label is "Back to Library". In mobile webviews / deep links there may be no
    // meaningful in-app history to navigate back to.
    navigate("/", { replace: true });
  };

  const [localChapter, setLocalChapter] = useState(() => {
    const fromQuery = parseInt(searchParams.get("ch") || "0", 10);
    return currentChapter ?? fromQuery;
  });

  const chapter = currentChapter ?? localChapter;

  // Hooks must be called before any conditional returns.
  const { bookContent, currentChapterContent, isLoading, error } = useBookContent(bookId, chapter);

  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMixSettings, setShowMixSettings] = useState(false);

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
  } = useTranslation(bookId, chapter, currentChapterContent);

  const {
    isSpeaking,
    isPaused,
    ttsRate,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    adjustRate,
    toggleTts,
    handleCloseTtsModal,
  } = useTextToSpeech(contentRef);

  const { progressLoaded, scrollPositionRef, saveProgressTimeoutRef } = useReadingProgress({
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

  const { jsxContent, contentVersion, mirrorMeta, reloadMirror, requestRefine, hasOpenAiKey } = useMixModeContent({
    bookId,
    chapter,
    isPdf: bookMetadata?.fileType === "pdf",
    settings,
    currentChapterContent,
    translatedContent,
    isTranslated,
    clearTranslation,
    contentRef: contentRef as RefObject<HTMLElement>,
    openAiKeyRefreshSignal: showMixSettings,
  });

  const { jpdbHighlighted, toggleJpdbHighlight } = useJpdbHighlighting({
    contentRef: contentRef as RefObject<HTMLElement>,
    currentChapterContent,
    translatedContent,
    isTranslated,
    isTranslating,
    contentVersion,
    mixEnabled: Boolean(settings?.mixEnabled),
    mixAutoEnableHighlight: Boolean(settings?.mixAutoEnableHighlight),
  });

  useGrammarReadAlong({
    contentRef: contentRef as RefObject<HTMLElement>,
    jpdbHighlighted,
    isPdf: bookMetadata?.fileType === "pdf",
    isTranslated,
    contentVersion,
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

  useEffect(() => {
    if (pdfLoaded && pdfViewerRef.current && pdfCurrentPage != null) {
      pdfViewerRef.current.goToPage(pdfCurrentPage);
    }
  }, [pdfLoaded, pdfCurrentPage]);

  const updateChapter = useCallback(
    (ch: number) => {
      // Clear any pending progress save before switching chapters.
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
      }

      // If chapter is controlled externally, delegate and exit early.
      if (setCurrentChapter) {
        setCurrentChapter(ch);
        return;
      }

      // Update local state and URL.
      setLocalChapter(ch);
      const newParams = new URLSearchParams(searchParams);
      newParams.set("ch", String(ch));
      setSearchParams(newParams, { replace: true });

      // Reset scroll position *after* progress for the previous chapter is saved.
      setTimeout(() => {
        scrollPositionRef.current = 0;
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
      }, 0);

      // Save progress for the new chapter starting at position 0.
      if (bookMetadata && progressLoaded) {
        saveBookProgress(bookId, ch, 0, undefined, undefined, bookMetadata.fileType);
      }
    },
    [
      bookId,
      bookMetadata,
      progressLoaded,
      saveBookProgress,
      saveProgressTimeoutRef,
      scrollPositionRef,
      searchParams,
      setCurrentChapter,
      setSearchParams,
    ]
  );

  useInternalEpubLinks({
    bookId,
    isPdf: bookMetadata?.fileType === "pdf",
    contentRef: contentRef as RefObject<HTMLElement>,
    bookContent,
    navigateToChapter: updateChapter,
  });

  const nextChapter = useCallback(() => {
    if (bookContent && chapter < bookContent.totalChapters - 1) {
      clearTranslation();
      updateChapter(chapter + 1);
    }
  }, [bookContent, chapter, updateChapter, clearTranslation]);

  const prevChapter = useCallback(() => {
    if (chapter > 0) {
      clearTranslation();
      updateChapter(chapter - 1);
    }
  }, [chapter, updateChapter, clearTranslation]);

  // PDF page navigation handlers
  const nextPdfPage = useCallback(() => {
    if (pdfPageCount && pdfCurrentPage < pdfPageCount) {
      const newPage = pdfCurrentPage + 1;
      setPdfCurrentPage(newPage);
      pdfViewerRef.current?.goToPage(newPage);

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
      pdfViewerRef.current?.goToPage(newPage);

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
    bookMetadata?.fileType === "pdf" ? nextPdfPage : nextChapter,
    bookMetadata?.fileType === "pdf" ? prevPdfPage : prevChapter
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ReaderHeader
        bookContent={bookContent}
        chapter={chapter}
        bookId={bookId}
        isTranslated={isTranslated}
        isAutoloaded={isAutoloaded}
        onBack={handleBack}
        onClearTranslation={() => clearTranslation({ suppressAutoload: true })}
        onShowSettings={() => setShowSettings(true)}
        onToggleTranslation={applyStoredTranslation}
      />

      <BookContent
        bookMetadata={bookMetadata}
        contentRef={contentRef as RefObject<HTMLDivElement>}
        jsxContent={jsxContent}
        error={error}
        isLoading={isLoading}
        pdfData={pdfData}
        pdfViewerRef={pdfViewerRef as RefObject<PdfViewerHandle>}
        setPdfPageCount={setPdfPageCount}
        settings={settings || undefined}
      />

      <ReaderControls
        currentChapter={bookMetadata?.fileType === "pdf" ? pdfCurrentPage - 1 : chapter}
        totalChapters={bookMetadata?.fileType === "pdf" ? pdfPageCount : bookContent?.totalChapters || 1}
        onPrevChapter={bookMetadata?.fileType === "pdf" ? prevPdfPage : prevChapter}
        onNextChapter={bookMetadata?.fileType === "pdf" ? nextPdfPage : nextChapter}
        bookId={bookId}
        chapterTitles={
          bookMetadata?.fileType === "pdf"
            ? Array.from({ length: pdfPageCount }, (_, i) => ({ index: i, title: `Page ${i + 1}`, href: "" }))
            : bookContent?.chapterTitles || []
        }
        onSelectChapter={
          bookMetadata?.fileType === "pdf"
            ? (idx) => {
                setPdfCurrentPage(idx + 1);
                pdfViewerRef.current?.goToPage(idx + 1);
              }
            : updateChapter
        }
        onToggleTts={toggleTts}
        ttsActive={isSpeaking}
        onToggleHighlight={toggleJpdbHighlight}
        jpdbHighlighted={jpdbHighlighted}
        onTranslate={() => translateCurrent(lastUseCefr)}
        translating={isTranslating}
        mixEnabled={Boolean(settings?.mixEnabled)}
        onShowMixSettings={() => setShowMixSettings(true)}
      />

      <TtsControlModal
        visible={isSpeaking}
        paused={isPaused}
        rate={ttsRate}
        onPauseResume={() => {
          if (isPaused) {
            resumeSpeaking();
          } else {
            pauseSpeaking();
          }
        }}
        onStop={stopSpeaking}
        onAdjustRate={adjustRate}
        onClose={handleCloseTtsModal}
      />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onTranslate={(useCefr) => {
            setLastUseCefr(useCefr);
            translateCurrent(useCefr);
          }}
          translating={isTranslating}
        />
      )}

      <MixSettingsModal
        visible={showMixSettings}
        onClose={() => setShowMixSettings(false)}
        mirrorMeta={mirrorMeta}
        isPdf={bookMetadata?.fileType === "pdf"}
        isTranslated={isTranslated}
        onReloadMirror={reloadMirror}
        onRequestRefine={hasOpenAiKey ? requestRefine : undefined}
      />
    </div>
  );
}

export default BookReader;
