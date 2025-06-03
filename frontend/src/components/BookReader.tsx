import { useQuery, useMutation } from "convex/react";
// import { api } from "../../convex/_generated/api";
// import { Id } from "../../convex/_generated/dataModel";
import { useEffect, useState, useRef } from "react";
// import jpHighlighter from "../../../src/jp-highlighter";
import { useSettings } from "../contexts/SettingsContext";
import { ReaderControls } from "./ReaderControls";
import { SettingsModal } from "./SettingsModal";
import { useBookContent } from "../hooks/useBookContent";

interface BookReaderProps {
  bookId: string; // Was: Id<"books">
  currentChapter: number;
  setCurrentChapter: (chapter: number) => void;
  onBack: () => void;
}

export function BookReader({ bookId, currentChapter, setCurrentChapter, onBack }: BookReaderProps) {
  // Use the new useBookContent hook instead of placeholder data
  const { bookContent, currentChapterContent, isLoading, error } = useBookContent(bookId, currentChapter);

  // TODO: Progress tracking - replace with real API calls
  const progress = { currentChapter: 0, currentPosition: 0 };
  const updateProgress = async (data: any) => { console.log("Update progress (TODO):", data); };

  const { settings } = useSettings();
  
  const [showSettings, setShowSettings] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [jpdbHighlighted, setJpdbHighlighted] = useState(false);
  const [isTranslated, setIsTranslated] = useState(false); // Track if current content is translated

  // Swipe control state
  const swipeRef = useRef({
    startX: null as number | null,
    startY: null as number | null,
    startTime: null as number | null,
    isSwiping: false
  });

  // Update reading progress
  useEffect(() => {
    const updateProgressDebounced = setTimeout(() => {
      // updateProgress({
      //   bookId,
      //   currentChapter,
      //   currentPosition: scrollPosition,
      // });
      // TODO: Call Flask API to update progress
      console.log("Debounced update progress (TODO):", { bookId, currentChapter, scrollPosition });
    }, 1000);

    return () => clearTimeout(updateProgressDebounced);
  }, [bookId, currentChapter, scrollPosition, /* updateProgress */]); // Removed updateProgress from dependencies for now

  // Clear translated content when chapter changes
  useEffect(() => {
    if (isTranslated && contentRef.current) {
      console.log('Chapter changed - clearing translated content');
      // Reset the content container to allow new chapter content to display
      setIsTranslated(false);
      // Force a re-render by clearing the innerHTML
      contentRef.current.innerHTML = '';
    }
  }, [currentChapter, isTranslated]);

  // Handle scroll tracking
  useEffect(() => {
    const handleScroll = () => {
      if (contentRef.current) {
        setScrollPosition(contentRef.current.scrollTop);
      }
    };

    const content = contentRef.current;
    if (content) {
      content.addEventListener('scroll', handleScroll);
      return () => content.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Initialize JPDB highlighter
  useEffect(() => {
    if (contentRef.current) {
      // jpHighlighter.initialize(contentRef.current);
    }
  }, []);

  // Restore scroll position from progress
  useEffect(() => {
    if (progress && contentRef.current && currentChapter === progress.currentChapter) {
      contentRef.current.scrollTop = progress.currentPosition;
    }
  }, [progress, currentChapter]);

  // Swipe controls implementation
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || !bookContent) return;

    const minLockDistance = 10;
    const minSwipeDistance = 60;
    const minVelocity = 0.3;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      
      // Ignore swipes on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest('a, button, input, textarea, select, [contenteditable="true"]')) {
        return;
      }

      swipeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTime: e.timeStamp,
        isSwiping: false
      };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || swipeRef.current.startX === null) return;

      const dx = e.clientX - swipeRef.current.startX;
      const dy = e.clientY - swipeRef.current.startY!;

      if (!swipeRef.current.isSwiping) {
        if (Math.abs(dx) > minLockDistance && Math.abs(dx) > Math.abs(dy)) {
          swipeRef.current.isSwiping = true;
          if (e.cancelable) e.preventDefault();
        } else if (Math.abs(dy) > minLockDistance && Math.abs(dy) > Math.abs(dx)) {
          swipeRef.current = { startX: null, startY: null, startTime: null, isSwiping: false };
        }
      } else {
        if (e.cancelable) e.preventDefault();
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || swipeRef.current.startX === null || !swipeRef.current.isSwiping) {
        swipeRef.current = { startX: null, startY: null, startTime: null, isSwiping: false };
        return;
      }

      const dx = e.clientX - swipeRef.current.startX;
      const dt = e.timeStamp - swipeRef.current.startTime!;
      const velocity = dt > 0 ? Math.abs(dx) / dt : 0;

      if (Math.abs(dx) > minSwipeDistance && velocity > minVelocity) {
        if (dx < 0) {
          // Swipe left - next chapter
          nextChapter();
        } else {
          // Swipe right - previous chapter
          prevChapter();
        }
      }

      swipeRef.current = { startX: null, startY: null, startTime: null, isSwiping: false };
    };

    contentEl.addEventListener('pointerdown', handlePointerDown);
    contentEl.addEventListener('pointermove', handlePointerMove);
    contentEl.addEventListener('pointerup', handlePointerUp);

    return () => {
      contentEl.removeEventListener('pointerdown', handlePointerDown);
      contentEl.removeEventListener('pointermove', handlePointerMove);
      contentEl.removeEventListener('pointerup', handlePointerUp);
    };
  }, [bookContent, currentChapter]);

  /**
   * Translate the current chapter using the backend API.
   * @param useCefr - If true include the CEFR level in the request.
   */
  const translateCurrent = async (useCefr: boolean) => {
    if (!contentRef.current || !currentChapterContent) return;
    setIsTranslating(true);
    
    // Get the actual content to translate (either from the rendered content or original)
    const contentToTranslate = isTranslated 
      ? currentChapterContent // Use original content if already translated
      : contentRef.current.innerHTML;
    
    const payload: any = {
      content: contentToTranslate,
      target_language: settings?.targetLanguage || "English",
      model: localStorage.getItem("openaiModel") || "gpt-4o-mini",
      api_key: localStorage.getItem("openaiKey") || "",
    };
    if (useCefr) {
      payload.cefr_level = localStorage.getItem("cefrLevel") || "B2";
    }
    try {
      const resp = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.translated_text && contentRef.current) {
          // Clear existing content and set the translated content
          contentRef.current.innerHTML = `
            <div class="max-w-4xl mx-auto py-4 sm:py-6 md:py-8">
              <div class="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed">
                ${data.translated_text}
              </div>
            </div>
          `;
          setIsTranslated(true);
          console.log('Content translated and marked as translated');
        }
      }
    } catch (error) {
      console.error('Translation error:', error);
    } finally {
      setIsTranslating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const nextChapter = () => {
    if (bookContent && currentChapter < bookContent.totalChapters - 1) {
      console.log('Moving to next chapter, clearing any translated content');
      setIsTranslated(false);
      setCurrentChapter(currentChapter + 1);
    }
  };

  const prevChapter = () => {
    if (currentChapter > 0) {
      console.log('Moving to previous chapter, clearing any translated content');
      setIsTranslated(false);
      setCurrentChapter(currentChapter - 1);
    }
  };

  const toggleHighlight = async () => {
    if (!contentRef.current) return;
    if (!jpdbHighlighted) {
      // await jpHighlighter.highlightContent(contentRef.current);
    } else {
      const saved = contentRef.current.getAttribute('data-original-content');
      if (saved) {
        contentRef.current.innerHTML = saved;
      }
    }
    setJpdbHighlighted(!jpdbHighlighted);
  };

  const clearTranslation = () => {
    if (contentRef.current && isTranslated) {
      console.log('Clearing translation, returning to original content');
      contentRef.current.innerHTML = '';
      setIsTranslated(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Reader Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Back to Library"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline-block ml-1 text-sm">Back to Library</span>
          </button>
          
          <div className="flex-1 min-w-0 border-l pl-3 sm:pl-4 border-gray-200 dark:border-gray-700">
            <h1 className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base">
              {bookContent?.title}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              Chapter {currentChapter + 1} of {bookContent?.totalChapters}
              {isTranslated && (
                <span className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                  Translated
                </span>
              )}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label="Settings"
        >
          <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        
        {/* Clear Translation Button - only show when translated */}
        {isTranslated && (
          <button
            onClick={clearTranslation}
            className="p-1.5 sm:p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ml-2"
            aria-label="Clear Translation"
            title="Show original text"
          >
            <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Reader Content */}
      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-8 lg:px-16 touch-pan-y"
        style={{
          fontSize: settings?.fontSize ? `${settings.fontSize}px` : '16px',
          fontFamily: settings?.fontFamily || 'Inter',
        }}
      >
        {/* Only render the normal content structure if not translated */}
        {!isTranslated && (
          <div className="max-w-4xl mx-auto py-4 sm:py-6 md:py-8">
            {currentChapterContent ? (
              <div 
                className="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none leading-relaxed"
                dangerouslySetInnerHTML={{ __html: currentChapterContent }}
              />
            ) : error ? (
              <div className="text-center py-8">
                <div className="text-red-600 dark:text-red-400 mb-4">
                  Error loading book: {error}
                </div>
                <button
                  onClick={onBack}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                >
                  Back to Library
                </button>
              </div>
            ) : (
              <div className="flex justify-center items-center py-8 sm:py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>
        )}
        {/* When translated, the content is directly in contentRef.innerHTML */}
      </div>

      {/* Reader Controls */}
      <ReaderControls
        currentChapter={currentChapter}
        totalChapters={bookContent?.totalChapters || 1}
        onPrevChapter={prevChapter}
        onNextChapter={nextChapter}
        bookId={bookId}
        jpdbHighlighted={jpdbHighlighted}
        onToggleHighlight={toggleHighlight}
      />

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onTranslate={(useCefr) => translateCurrent(useCefr)}
          translating={isTranslating}
        />
      )}
    </div>
  );
}
