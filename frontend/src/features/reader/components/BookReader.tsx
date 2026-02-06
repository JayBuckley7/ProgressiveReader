import { useEffect, useState, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { useSettings } from "@shared/contexts/SettingsContext";
import { ReaderControls } from "./ReaderControls";
import { TtsControlModal } from "@shared/components/TtsControlModal";
import { SettingsModal } from "@shared/components/SettingsModal";
import { useAppData } from "@shared/contexts/AppDataContext";
import { bookStorageService } from "@features/books/services/bookStorage";
import { useBookContent } from "@features/reader/hooks/useBookContent";
import { initialize as initializeJpdb, highlightContent, removeJpdbHighlighting } from "@features/reader/services/jpdbInitializer";
import { loadConfig as loadJpdbConfig } from "@features/reader/content/api-adapter";
import { parseHtmlToJsx } from "@features/reader/utils/htmlToJsx";
import { useSwipe } from "@features/reader/hooks/useSwipe";
import { useTranslation } from "@features/reader/hooks/useTranslation";
import { useTextToSpeech } from "@features/reader/hooks/useTextToSpeech";
import { useReadingProgress } from "@features/reader/hooks/useReadingProgress";
import { ReaderHeader } from "./ReaderHeader";
import { BookContent } from "./BookContent";
import { PdfViewerHandle } from "@shared/components/PdfViewer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation as useI18n } from "react-i18next";
import { PdfViewer } from "@shared/components/PdfViewer";

interface BookReaderProps {
  bookId: string;
  currentChapter?: number;
  setCurrentChapter?: (chapter: number) => void;
  onBack?: () => void;
}

export function BookReader({ bookId, currentChapter, setCurrentChapter, onBack }: BookReaderProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { books, getReadingProgress, saveBookProgress } = useAppData();
  const bookMetadata = useMemo(() => books.find(b => b.id === bookId), [books, bookId]);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle initial PDF page from URL
  const initialPdfPage = useMemo(() => {
    const pageFromQuery = parseInt(searchParams.get('page') || '1', 10);
    return Math.max(1, pageFromQuery);
  }, [searchParams]);

  const [pdfCurrentPage, setPdfCurrentPage] = useState(initialPdfPage);

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
    const fromQuery = parseInt(searchParams.get('ch') || '0', 10);
    return currentChapter ?? fromQuery;
  });
   
  const chapter = currentChapter ?? localChapter;

  // Use hooks first - they need to be called before any useEffect that uses their values
  const { bookContent, currentChapterContent, isLoading, error } = useBookContent(bookId, chapter);
  const { settings } = useSettings();
  
  // PDF page navigation state
  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const jpdbInitRef = useRef(false);
  const [jpdbHighlighted, setJpdbHighlighted] = useState(false);
  const [contentVersion, setContentVersion] = useState(0);

  // Use extracted hooks
  const {
    translateCurrent,
    isTranslating,
    isTranslated,
    translatedContent,
    clearTranslation,
    isAutoloaded,
    lastUseCefr,
    setLastUseCefr,
  } = useTranslation(bookId, chapter, currentChapterContent);

  const {
    isSpeaking,
    isPaused,
    ttsRate,
    speakCurrentChapter,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    adjustRate,
    toggleTts,
    handleCloseTtsModal,
  } = useTextToSpeech(contentRef);

  const {
    progressLoaded,
    scrollPositionRef,
    saveProgressTimeoutRef,
  } = useReadingProgress({
    bookId,
    bookMetadata,
    chapter,
    contentRef: contentRef as React.RefObject<HTMLDivElement>,
    getReadingProgress,
    saveBookProgress,
    setLocalChapter,
    setPdfCurrentPage,
    searchParams,
    setSearchParams,
    currentChapter,
    setCurrentChapter,
  });

  // Load PDF data when metadata is ready
  useEffect(() => {
    if (!bookMetadata || bookMetadata.fileType !== "pdf" || !progressLoaded) return;

    const load = async () => {
      const blob = await bookStorageService.downloadBook(bookId, bookMetadata);
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        setPdfData(arrayBuffer);
        setPdfLoaded(true);
      }
    };

    load();
  }, [bookMetadata, bookId, progressLoaded]);

  useEffect(() => {
    if (pdfLoaded && pdfViewerRef.current && pdfCurrentPage != null) {
      pdfViewerRef.current.goToPage(pdfCurrentPage);
    }
  }, [pdfLoaded, pdfCurrentPage]);

  const updateChapter = useCallback(
    (ch: number) => {
      // Clear any pending progress save before switching chapters
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
      }

      // If chapter is controlled externally, delegate and exit early
      if (setCurrentChapter) {
        setCurrentChapter(ch);
        return;
      }

      // Update local state and URL
      setLocalChapter(ch);
      const newParams = new URLSearchParams(searchParams);
      newParams.set("ch", String(ch));
      setSearchParams(newParams, { replace: true });

      // Reset scroll position *after* progress for the previous chapter is saved
      setTimeout(() => {
        scrollPositionRef.current = 0;
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
        }
      }, 0);

      // Save progress for the new chapter starting at position 0
      if (bookMetadata && progressLoaded) {
        saveBookProgress(
          bookId,
          ch,
          0,
          undefined,
          undefined,
          bookMetadata.fileType
        );
      }
    },
    [
      setCurrentChapter,
      searchParams,
      setSearchParams,
      setLocalChapter,
      bookId,
      bookMetadata,
      progressLoaded,
      saveBookProgress,
      scrollPositionRef,
      saveProgressTimeoutRef,
    ]
  );


  const jsxContent = useMemo(() => {
    const html = isTranslated ? translatedContent ?? '' : currentChapterContent ?? '';
    if (!html) return null;
    // Always use parseHtmlToJsx without the simple highlighter - let the proper JPDB system handle highlighting
    return parseHtmlToJsx(html);
  }, [currentChapterContent, translatedContent, isTranslated, jpdbHighlighted, contentVersion]);

  // Refs for current values to avoid effect dependencies
  const bookContentRef = useRef(bookContent);
  const updateChapterRef = useRef(updateChapter);

  // Update refs when values change
  useEffect(() => {
    bookContentRef.current = bookContent;
  }, [bookContent]);

  useEffect(() => {
    updateChapterRef.current = updateChapter;
  }, [updateChapter]);

  // Bump version when content changes so highlighting recalculates
  useEffect(() => {
    setContentVersion(v => v + 1);
  }, [currentChapterContent, translatedContent]);

  // Stable link click handler that doesn't change with chapter updates
  const handleLinkClick = useCallback((e: Event) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    
    if (!link || !link.href) return;

    // If the user is selecting text, don't treat this as a link click.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Check if this is an internal EPUB link
    const href = link.getAttribute('href') || '';
    const isInternalLink = href.startsWith('#') || 
                         href.endsWith('.xhtml') || 
                         href.endsWith('.html') ||
                         href.includes('.xhtml#') ||
                         href.includes('.html#');
    
    if (!isInternalLink) {
      return; // Let external links work normally
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const currentBookContent = bookContentRef.current;
    const contentEl = contentRef.current;
    
    if (!currentBookContent || !contentEl) return;
    
    // Try to find the target chapter
    let targetChapter = -1;
    
    // Method 1: Look for chapter by href in chapterTitles
    if (currentBookContent.chapterTitles) {
      const chapterMatch = currentBookContent.chapterTitles.find(ch => {
        const chapterHref = ch.href || '';
        // Compare the base file name
        const linkBase = href.split('#')[0].split('/').pop() || '';
        const chapterBase = chapterHref.split('#')[0].split('/').pop() || '';
        return linkBase && chapterBase && linkBase === chapterBase;
      });
      
      if (chapterMatch) {
        targetChapter = chapterMatch.index;
      }
    }
    
    // Method 2: Try to parse chapter number from href
    if (targetChapter === -1) {
      const chapterMatch = href.match(/chapter[_-]?(\d+)/i) || 
                         href.match(/ch[_-]?(\d+)/i) ||
                         href.match(/(\d+)\.x?html/i);
      if (chapterMatch) {
        const chapterNum = parseInt(chapterMatch[1], 10);
        if (chapterNum >= 1 && chapterNum <= currentBookContent.totalChapters) {
          targetChapter = chapterNum - 1; // Convert to 0-based index
        }
      }
    }
    
    // Method 3: Look for anchor in current or nearby chapters
    if (targetChapter === -1 && href.startsWith('#')) {
      const anchorId = href.substring(1);
      
      // Check current chapter first
      const currentContent = contentEl.innerHTML;
      if (currentContent.includes(`id="${anchorId}"`)) {
        const anchorEl = contentEl.querySelector(`#${anchorId}`);
        if (anchorEl) {
          anchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
      
      // TODO: Search other chapters if needed (more complex implementation)
    }
    
    // Navigate to the target chapter if found
    if (targetChapter >= 0 && targetChapter < currentBookContent.totalChapters) {
      updateChapterRef.current(targetChapter);
    } else {
      // Show a helpful message to the user
      alert(`Unable to navigate to: ${link.textContent || href}\n\nThis link could not be mapped to a chapter in the current book structure.`);
    }
  }, []); // No dependencies - stable handler

  // Handle internal EPUB links (bind once per book, not per chapter)
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || bookMetadata?.fileType === 'pdf') return;

    // Add click event listener to the content area
    contentEl.addEventListener('click', handleLinkClick);
    
    return () => {
      contentEl.removeEventListener('click', handleLinkClick);
    };
  }, [bookId, bookMetadata?.fileType, handleLinkClick]); // Only rebind when book changes

  // Initialize JPDB highlighter once on mount
  useEffect(() => {
    if (jpdbInitRef.current) return;
    jpdbInitRef.current = true;
    if (contentRef.current) {
      initializeJpdb(contentRef.current);
    }
  }, []);

  // Apply JPDB highlighting when enabled or when content changes while enabled
  // Use useLayoutEffect to coordinate with React's rendering cycle and avoid DOM conflicts
  useLayoutEffect(() => {
    const el = contentRef.current;
    const activeHtml = isTranslated ? translatedContent : currentChapterContent;

    if (jpdbHighlighted && el && activeHtml) {
      // Use requestAnimationFrame to ensure React has finished updating the DOM
      const frameId = requestAnimationFrame(() => {
        if (!el) return;
        highlightContent(el).catch((error) => {
          console.error('highlightContent failed:', error);
        });
      });
      
      return () => cancelAnimationFrame(frameId);
    } else if (!jpdbHighlighted && el) {
      // Clear highlighting when disabled
      removeJpdbHighlighting(el);
    }
  }, [jpdbHighlighted, currentChapterContent, translatedContent, isTranslated]);

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
      
      // Save progress when PDF page changes
      if (bookMetadata && progressLoaded) {
        saveBookProgress(
          bookId, 
          newPage - 1, // Use 0-based chapter for consistency
          0, 
          newPage,
          pdfPageCount,
          'pdf'
        );
      }

    }
  }, [pdfPageCount, pdfCurrentPage, bookMetadata, progressLoaded, saveBookProgress, bookId]);

  const prevPdfPage = useCallback(() => {
    if (pdfCurrentPage > 1) {
      const newPage = pdfCurrentPage - 1;
      setPdfCurrentPage(newPage);
      pdfViewerRef.current?.goToPage(newPage);
      
      // Save progress when PDF page changes
      if (bookMetadata && progressLoaded) {
        saveBookProgress(
          bookId, 
          newPage - 1, // Use 0-based chapter for consistency
          0, 
          newPage,
          pdfPageCount,
          'pdf'
        );
      }
    }
  }, [pdfCurrentPage, pdfPageCount, bookMetadata, progressLoaded, saveBookProgress, bookId]);



  const toggleJpdbHighlight = useCallback(() => {
    setJpdbHighlighted(prev => {
      const newState = !prev;
      
      // If enabling highlighting, ensure JPDB config is reloaded to get latest settings
      // No need to re-initialize - just reload config since initialization already happened
      if (newState) {
        loadJpdbConfig(); // Just reload config, don't re-initialize
      }
      
      return newState;
    });
  }, [jpdbHighlighted]);

  useSwipe(
    contentRef as React.RefObject<HTMLElement>,
    bookMetadata?.fileType === 'pdf' ? nextPdfPage : nextChapter,
    bookMetadata?.fileType === 'pdf' ? prevPdfPage : prevChapter
  );

  // ✅ ALL HOOKS ARE NOW CALLED - Conditional rendering can happen after this point
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
        onClearTranslation={clearTranslation}
        onShowSettings={() => setShowSettings(true)}
        onToggleTranslation={(translation) => {
          // This is handled internally by useTranslation hook via autoload
        }}
      />

      <BookContent
        bookMetadata={bookMetadata}
        contentRef={contentRef as React.RefObject<HTMLDivElement>}
        jsxContent={jsxContent}
        error={error}
        isLoading={isLoading}
        pdfData={pdfData}
        pdfViewerRef={pdfViewerRef as React.RefObject<PdfViewerHandle>}
        setPdfPageCount={setPdfPageCount}
        settings={settings || undefined}
      />

      {/* Reader Controls */}
      <ReaderControls
          currentChapter={bookMetadata?.fileType === 'pdf' ? pdfCurrentPage - 1 : chapter}
          totalChapters={bookMetadata?.fileType === 'pdf' ? pdfPageCount : bookContent?.totalChapters || 1}
          onPrevChapter={bookMetadata?.fileType === 'pdf' ? prevPdfPage : prevChapter}
          onNextChapter={bookMetadata?.fileType === 'pdf' ? nextPdfPage : nextChapter}
          bookId={bookId}
          chapterTitles={bookMetadata?.fileType === 'pdf' ?
            Array.from({ length: pdfPageCount }, (_, i) => ({ index: i, title: `Page ${i + 1}`, href: '' })) :
            bookContent?.chapterTitles || []}
          onSelectChapter={bookMetadata?.fileType === 'pdf' ? (idx => {
            setPdfCurrentPage(idx + 1);
            pdfViewerRef.current?.goToPage(idx + 1);
          }) : updateChapter}
          onToggleTts={toggleTts}
          ttsActive={isSpeaking}
          onToggleHighlight={toggleJpdbHighlight}
          jpdbHighlighted={jpdbHighlighted}
          onTranslate={() => translateCurrent(lastUseCefr)}
          translating={isTranslating}
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

      {/* Settings Modal */}
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
    </div>
  );
}

export default BookReader;
