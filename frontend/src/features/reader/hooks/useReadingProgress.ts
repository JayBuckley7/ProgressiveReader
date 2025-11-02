import { useState, useRef, useEffect, useCallback } from "react";

interface ReadingProgress {
  currentChapter?: number;
  currentPosition?: number;
  currentPage?: number;
}

interface UseReadingProgressProps {
  bookId: string;
  bookMetadata: { fileType?: string } | null;
  chapter: number;
  contentRef: React.RefObject<HTMLDivElement>;
  getReadingProgress: (bookId: string) => Promise<ReadingProgress | null>;
  saveBookProgress: (
    bookId: string,
    chapter: number,
    position: number,
    currentPage?: number,
    totalPages?: number,
    fileType?: string
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

  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  // Load reading progress when book opens (runs once per book)
  useEffect(() => {
    if (!bookMetadata || progressLoaded) return;
    
    (async () => {
      try {
        const progress = await getReadingProgress(bookId);
        if (progress) {
          console.log('📖 Restoring reading progress:', progress);
          
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
                contentRef.current.scrollTop = progress.currentPosition!;
              }
            }, 500); // Delay to ensure content is loaded
          }
        }
      } catch (error) {
        console.error('Failed to load reading progress:', error);
      } finally {
        setProgressLoaded(true);
      }
    })();
  }, [bookId, bookMetadata, getReadingProgress, setLocalChapter, setPdfCurrentPage, setSearchParams, contentRef]);

  // Save reading progress helper
  const fileType = bookMetadata?.fileType;
  const saveProgress = useCallback(() => {
    if (fileType && progressLoaded && fileType !== "pdf") {
      saveBookProgress(
        bookId,
        chapter,
        scrollPositionRef.current,
        undefined,
        undefined,
        fileType
      );
    }
  }, [fileType, progressLoaded, saveBookProgress, bookId, chapter]);

  const saveProgressRef = useRef(saveProgress);
  useEffect(() => {
    saveProgressRef.current = saveProgress;
  }, [saveProgress]);

  // Stable scroll handler that doesn't change with saveProgress updates
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    scrollPositionRef.current = contentRef.current.scrollTop;
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

  return {
    progressLoaded: progressLoaded as boolean,
    scrollPositionRef,
    saveProgressTimeoutRef,
    saveProgress,
  };
}

