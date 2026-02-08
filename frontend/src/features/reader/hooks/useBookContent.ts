import { useState, useEffect, useRef, useMemo } from 'react';
import { BookMetadata } from '~/types';
import { useAppData } from '@shared/contexts/AppDataContext';
import { EpubProcessorWrapper } from '@shared/lib/epubProcessor.ts';
import { TextProcessorWrapper } from '@shared/lib/textProcessor.ts';

import type { ChapterTitle } from '~/types/index.ts';
import { appLog } from '@shared/appLog'

interface BookContent {
  title: string;
  totalChapters: number;
  chapters: string[];
  chapterTitles: ChapterTitle[];
}

interface UseBookContentReturn {
  bookContent: BookContent | null;
  currentChapterContent: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useBookContent(bookId: string, currentChapter: number = 0): UseBookContentReturn {
  const { books, downloadBook, isLoading: isAppLoading } = useAppData();
  const [bookContent, setBookContent] = useState<BookContent | null>(null);
  const [currentChapterContent, setCurrentChapterContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const processorRef = useRef<any>(null);
  const loadedBookIdRef = useRef<string | null>(null);

  const activeLoadRef = useRef<{
    bookId: string;
    requestId: string;
    metadata: Pick<BookMetadata, 'title' | 'fileType' | 'driveFileId'>;
  } | null>(null);
  const prevMetadataRef = useRef<
    Pick<BookMetadata, 'title' | 'fileType' | 'driveFileId'> | null
  >(null);

  appLog.debug('[useBookContent] Hook', { bookId, currentChapter, books: books.length });

  // Memoize the book metadata to prevent unnecessary re-renders
  const bookMetadata = useMemo(() => {
    const metadata = books.find(book => book.id === bookId);
    appLog.debug('[useBookContent] Metadata', { found: Boolean(metadata) });
    return metadata;
  }, [books, bookId]);

  // Get the book processors (now directly imported)
  const getProcessors = () => {
    return {
      EpubProcessorWrapper,
      TextProcessorWrapper
    };
  };

  // Load and process the book
  useEffect(() => {
    // Skip if no metadata
    if (!bookMetadata) {
      if (isAppLoading) {
        // Still waiting for app data to load... keep loading state
        appLog.debug('[useBookContent] Waiting for app data to load...');
        return;
      }
      appLog.warn('[useBookContent] No book metadata found', { bookId });
      setError('Book not in library. Return to library and try again.');
      setIsLoading(false);
      return;
    }

    const prev = prevMetadataRef.current;
    const metaUnchanged =
      prev &&
      prev.title === bookMetadata.title &&
      prev.fileType === bookMetadata.fileType &&
      prev.driveFileId === bookMetadata.driveFileId;

    // Skip if this book is already loaded and metadata hasn't changed
    if (loadedBookIdRef.current === bookId && bookContent && metaUnchanged) {
      appLog.debug('[useBookContent] Book already loaded; skipping reload', { bookId });
      setIsLoading(false);
      return;
    }

    // Skip if already loading this book with the same metadata to prevent duplicate loading
    if (
      isLoading &&
      activeLoadRef.current &&
      activeLoadRef.current.bookId === bookId &&
      activeLoadRef.current.metadata.title === bookMetadata.title &&
      activeLoadRef.current.metadata.fileType === bookMetadata.fileType &&
      activeLoadRef.current.metadata.driveFileId === bookMetadata.driveFileId
    ) {
      appLog.debug('[useBookContent] Book already loading; skipping duplicate request', { bookId });
      return;
    }

    const loadBook = async () => {
      const requestId = `${bookId}-${Date.now()}`;
      try {
        setIsLoading(true);
        setError(null);
        // Mark the current book as in-progress immediately to prevent
        // duplicate loads triggered by re-renders while loading
        activeLoadRef.current = {
          bookId,
          requestId,
          metadata: {
            title: bookMetadata.title,
            fileType: bookMetadata.fileType,
            driveFileId: bookMetadata.driveFileId,
          },
        };

        appLog.debug('[useBookContent] Loading book', {
          bookId,
          title: bookMetadata.title,
          fileType: bookMetadata.fileType,
        });

        // Get the processors
        const processors = getProcessors();

        // Download book content from Google Drive
        const bookBlob = await downloadBook(bookId, bookMetadata);
        if (!bookBlob) {
          throw new Error('Failed to download book content');
        }

        // Convert blob to ArrayBuffer
        const arrayBuffer = await bookBlob.arrayBuffer();

        // Choose the appropriate processor based on file type
        let processor: EpubProcessorWrapper | TextProcessorWrapper;
        let loaded: boolean;

        if (bookMetadata.fileType === 'epub') {
          // Use EPUB processor
          processor = new processors.EpubProcessorWrapper();

          // Load the book with the EPUB processor
          loaded = await processor.loadBook(arrayBuffer);
        } else {
          // Default to Text processor for other types
          processor = new processors.TextProcessorWrapper();

          // Load the book with the text processor
          loaded = await processor.loadBook(arrayBuffer, { fileType: bookMetadata.fileType });
        }
        if (!loaded) {
          throw new Error(`Failed to load book using ${processor.constructor.name}`);
        }

        processorRef.current = processor;

        // Get book metadata
        const totalChapters = processor.getTotalChapters();
        const chapterTitles = (await processor.getChapterTitles()) as ChapterTitle[];

        // Pre-load all chapters (for smaller books) or load them on-demand
        const chapters: string[] = [];
        if (totalChapters <= 10) {
          // Pre-load all chapters for small books
          appLog.debug('[useBookContent] Preloading chapters', { bookId, totalChapters });
          for (let i = 0; i < totalChapters; i++) {
            const chapterHtml = await processor.getChapterHtml(i);
            chapters[i] = chapterHtml || '';
          }
        } else {
          appLog.debug('[useBookContent] Skipping preload (large book)', { bookId, totalChapters });
        }

        // Bail out if the user navigated away before load finished
        if (activeLoadRef.current?.requestId !== requestId) {
          appLog.debug(
            '[useBookContent] Active book changed before load completed; ignoring results',
            { requestId }
          );
          return;
        }

        setBookContent({
          title: bookMetadata.title,
          totalChapters,
          chapters,
          chapterTitles: chapterTitles || []
        });

        // Mark this book as loaded
        loadedBookIdRef.current = bookId;

        appLog.debug('[useBookContent] Loaded', { bookId, totalChapters });

        prevMetadataRef.current = {
          title: bookMetadata.title,
          fileType: bookMetadata.fileType,
          driveFileId: bookMetadata.driveFileId,
        };

      } catch (error) {
        appLog.error('[useBookContent] Error loading book content', error);
        if (activeLoadRef.current?.requestId === requestId) {
          setError(error instanceof Error ? error.message : 'Failed to load book');
          setIsLoading(false); // Exit loading state on failure
          loadedBookIdRef.current = null; // Reset on error
          activeLoadRef.current = null;
        }
      } finally {
        if (activeLoadRef.current?.requestId === requestId) {
          setIsLoading(false);
          activeLoadRef.current = null;
        }
      }
    };

    loadBook();
  }, [
    bookId,
    bookMetadata?.title,
    bookMetadata?.fileType,
    bookMetadata?.driveFileId,
    downloadBook,
  ]);

  // Reset loaded book reference when bookId changes
  useEffect(() => {
    if (loadedBookIdRef.current !== bookId) {
      loadedBookIdRef.current = null;
      // Clear previously stored metadata so returning to a book with
      // updated details doesn't incorrectly skip reloading
      prevMetadataRef.current = null;
      setBookContent(null);
      setCurrentChapterContent(null);
      processorRef.current = null;
    }
    if (activeLoadRef.current?.bookId !== bookId) {
      activeLoadRef.current = null;
    }
  }, [bookId]);

  // Load current chapter content
  useEffect(() => {
    if (!bookContent || !processorRef.current) {
      setCurrentChapterContent(null);
      return;
    }

    const loadChapterContent = async () => {
      try {
        // If chapter is pre-loaded, use it
        if (bookContent.chapters[currentChapter]) {
          setCurrentChapterContent(bookContent.chapters[currentChapter]);
          return;
        }

        // Otherwise, load chapter on-demand
        if (import.meta.env.DEV) {
          appLog.debug('Loading chapter content on-demand:', currentChapter);
        }
        const chapterHtml = await processorRef.current.getChapterHtml(currentChapter);
        setCurrentChapterContent(chapterHtml || '<p>Chapter content not available</p>');
      } catch (error) {
        appLog.error('[useBookContent] Error loading chapter content', error);
        setCurrentChapterContent('<p>Error loading chapter content</p>');
      }
    };

    loadChapterContent();
  }, [bookContent, currentChapter]);

  return {
    bookContent,
    currentChapterContent,
    isLoading,
    error
  };
} 
