import { useState, useRef, useEffect, useCallback } from "react";
import { appLog } from '@shared/appLog'

interface ReadingProgress {
  currentChapter?: number;
  currentPosition?: number;
  currentPage?: number;
  scrollHeight?: number;
  viewportHeight?: number;
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
    viewportHeight?: number
  ) => Promise<void>;
  setLocalChapter: (chapter: number) => void;
  setPdfCurrentPage: (page: number) => void;
  searchParams: URLSearchParams;
  setSearchParams: (params: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams), options?: { replace?: boolean }) => void;
  currentChapter?: number;
  setCurrentChapter?: (chapter: number) => void;
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
}: UseReadingProgressProps) {
  const [progressLoaded, setProgressLoaded] = useState(false);
  const scrollPositionRef = useRef(0);
  const saveProgressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParamsRef = useRef(searchParams);
  const currentChapterRef = useRef(currentChapter);
  const setSearchParamsRef = useRef(setSearchParams);
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
    verticalWritingRef.current = verticalWriting;
  }, [verticalWriting]);

  // Load reading progress when book opens (runs once per book)
  useEffect(() => {
    if (!bookMetadata || progressLoaded) return;
    
    (async () => {
      try {
        const progress = await getReadingProgress(bookId);
        if (progress) {
          appLog.debug('[useReadingProgress] Restoring reading progress:', progress);
          
          if (bookMetadata.fileType === 'pdf' && progress.currentPage) {
            // For PDFs, restore the page (only if not set via URL)
            const currentSearchParams = searchParamsRef.current;
            if (!currentSearchParams.get('page')) {
              setPdfCurrentPage(progress.currentPage);
            }
          } else if (progress.currentChapter !== undefined) {
            // For EPUB/text books, restore the chapter (only if not set via URL or prop)
            const currentSearchParams = searchParamsRef.current;
            const currentChapterValue = currentChapterRef.current;
            
            if (!currentChapterValue && !currentSearchParams.get('ch')) {
              setLocalChapter(progress.currentChapter);
              const newParams = new URLSearchParams(currentSearchParams);
              newParams.set('ch', String(progress.currentChapter));
              setSearchParamsRef.current(newParams, { replace: true });
            }
          }
          
          // Restore scroll position if available
          if (progress.currentPosition !== undefined && progress.currentPosition !== null) {
            setTimeout(() => {
              if (contentRef.current) {
                if (verticalWritingRef.current && bookMetadata.fileType !== "pdf") {
                  const maxScrollLeft = Math.max(
                    0,
                    contentRef.current.scrollWidth - contentRef.current.clientWidth
                  );
                  contentRef.current.scrollLeft = Math.max(
                    0,
                    maxScrollLeft - progress.currentPosition!
                  );
                } else {
                  contentRef.current.scrollTop = progress.currentPosition!;
                }
              }
            }, 500); // Delay to ensure content is loaded
          }
        }
      } catch (error) {
        appLog.error('[useReadingProgress] Failed to load reading progress', error);
      } finally {
        setProgressLoaded(true);
      }
    })();
  }, [bookId, bookMetadata, getReadingProgress, setLocalChapter, setPdfCurrentPage, setSearchParams, contentRef]);

  // Save reading progress helper
  const fileType = bookMetadata?.fileType;
  const saveProgress = useCallback(() => {
    if (fileType && progressLoaded && fileType !== "pdf") {
      const el = contentRef.current;
      const scrollExtent = el
        ? verticalWriting
          ? el.scrollWidth
          : el.scrollHeight
        : undefined;
      const viewportExtent = el
        ? verticalWriting
          ? el.clientWidth
          : el.clientHeight
        : undefined;
      saveBookProgress(
        bookId,
        chapter,
        scrollPositionRef.current,
        undefined,
        undefined,
        fileType,
        scrollExtent,
        viewportExtent
      );
    }
  }, [fileType, progressLoaded, saveBookProgress, bookId, chapter, contentRef, verticalWriting]);

  const saveProgressRef = useRef(saveProgress);
  useEffect(() => {
    saveProgressRef.current = saveProgress;
  }, [saveProgress]);

  // Stable scroll handler that doesn't change with saveProgress updates
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    scrollPositionRef.current = verticalWritingRef.current
      ? Math.max(
          0,
          contentRef.current.scrollWidth -
            contentRef.current.clientWidth -
            contentRef.current.scrollLeft
        )
      : contentRef.current.scrollTop;
    if (saveProgressTimeoutRef.current) {
      clearTimeout(saveProgressTimeoutRef.current);
    }
    // Increase timeout to 5 seconds to reduce frequency of saves
    saveProgressTimeoutRef.current = setTimeout(() => saveProgressRef.current(), 5000);
  }, [contentRef]);

  // Handle scroll tracking (bind once when content is available)
  useEffect(() => {
    const content = contentRef.current;
    if (content) {
      content.addEventListener('scroll', handleScroll);
      return () => {
        content.removeEventListener('scroll', handleScroll);
        if (saveProgressTimeoutRef.current) {
          clearTimeout(saveProgressTimeoutRef.current);
        }
      };
    }
  }, [handleScroll, contentRef]);

  // Ensure progress is saved when chapter changes and on unmount
  useEffect(() => {
    saveProgress();
    return () => {
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
      }
      saveProgress();
    };
  }, [saveProgress]);

  const navigateToChapter = useCallback(
    (ch: number) => {
      // Clear any pending progress save before switching chapters.
      if (saveProgressTimeoutRef.current) {
        clearTimeout(saveProgressTimeoutRef.current);
      }

      // Reset both axes after the new chapter renders. Only one axis is active,
      // but clearing both prevents a stale position when writing mode changes.
      setTimeout(() => {
        scrollPositionRef.current = 0;
        if (contentRef.current) {
          contentRef.current.scrollTop = 0;
          contentRef.current.scrollLeft = verticalWritingRef.current
            ? Math.max(0, contentRef.current.scrollWidth - contentRef.current.clientWidth)
            : 0;
        }
      }, 0);

      // If chapter is controlled externally, delegate and exit early.
      if (setCurrentChapter) {
        setCurrentChapter(ch);
        return;
      }

      // Update local state and URL.
      setLocalChapter(ch);
      const newParams = new URLSearchParams(searchParamsRef.current);
      newParams.set("ch", String(ch));
      setSearchParamsRef.current(newParams, { replace: true });

      // Save progress for the new chapter starting at position 0.
      if (bookMetadata && progressLoaded) {
        saveBookProgress(bookId, ch, 0, undefined, undefined, bookMetadata.fileType);
      }
    },
    [bookId, bookMetadata, contentRef, progressLoaded, saveBookProgress, setCurrentChapter, setLocalChapter]
  );

  return {
    progressLoaded: progressLoaded as boolean,
    scrollPositionRef,
    saveProgressTimeoutRef,
    saveProgress,
    navigateToChapter,
  };
}
