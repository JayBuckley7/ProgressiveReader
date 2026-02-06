import { useState, useEffect, useRef, useMemo } from 'react';
import { BookMetadata } from '~/types';
import { bookStorageService } from '@features/books/services/bookStorage';
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
  const { books, isLoading: isAppLoading } = useAppData();
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

  // Add debug logging only in development mode
  if (process.env.NODE_ENV === 'development') {
    appLog.debug(`📚 [useBookContent] Hook called for bookId: ${bookId}, chapter: ${currentChapter}, books.length: ${books.length}`);
  }

  // Memoize the book metadata to prevent unnecessary re-renders
  const bookMetadata = useMemo(() => {
    const metadata = books.find(book => book.id === bookId);
    if (process.env.NODE_ENV === 'development') {
      appLog.debug(`📚 [useBookContent] Book metadata lookup result:`, metadata ? 'Found' : 'Not found');
    }
    return metadata;
  }, [books, bookId]);

  // Get the book processors (now directly imported)
  const getProcessors = () => {
    if (process.env.NODE_ENV === 'development') {
      appLog.debug('Getting processor classes...');
    }
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
        appLog.debug('useBookContent: Waiting for app data to load...');
        return;
      }
      appLog.debug('useBookContent: No book metadata found for bookId:', bookId);
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
      appLog.debug('useBookContent: Book already loaded, skipping reload for:', bookId);
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
      appLog.debug('useBookContent: Book is already loading, skipping duplicate request for:', bookId);
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

        appLog.debug('Loading book content for:', bookMetadata.title, 'ID:', bookId);
        appLog.debug('Book metadata:', bookMetadata);

        // Get the processors
        appLog.debug('Step 1: Getting processors...');
        const processors = getProcessors();
        appLog.debug('Step 1 complete: Processors available');

        // Download book content from Google Drive
        appLog.debug('Step 2: Downloading book from Google Drive...');
        const bookBlob = await bookStorageService.downloadBook(bookId, bookMetadata);
        if (!bookBlob) {
          throw new Error('Failed to download book content');
        }

        appLog.debug('Step 2 complete: Book downloaded successfully, size:', bookBlob.size, 'type:', bookBlob.type);

        // Convert blob to ArrayBuffer
        appLog.debug('Step 3: Converting blob to ArrayBuffer...');
        const arrayBuffer = await bookBlob.arrayBuffer();
        appLog.debug('Step 3 complete: ArrayBuffer size:', arrayBuffer.byteLength);

        // Choose the appropriate processor based on file type
        appLog.debug('Step 4: Creating processor for file type:', bookMetadata.fileType);
        let processor: EpubProcessorWrapper | TextProcessorWrapper;
        let loaded: boolean;

        if (bookMetadata.fileType === 'epub') {
          // Use EPUB processor
          processor = new processors.EpubProcessorWrapper();
          appLog.debug('Step 4 complete: Created EpubProcessorWrapper');

          // Load the book with the EPUB processor
          appLog.debug('Step 5: Loading book with EpubProcessorWrapper...');
          loaded = await processor.loadBook(arrayBuffer);
        } else {
          // Default to Text processor for other types
          processor = new processors.TextProcessorWrapper();
          appLog.debug('Step 4 complete: Created TextProcessorWrapper');

          // Load the book with the text processor
          appLog.debug('Step 5: Loading book with TextProcessorWrapper...');
          loaded = await processor.loadBook(arrayBuffer, { fileType: bookMetadata.fileType });
        }
        if (!loaded) {
          throw new Error(`Failed to load book using ${processor.constructor.name}`);
        }
        appLog.debug('Step 5 complete: Book loaded with processor');

        processorRef.current = processor;

        // Get book metadata
        appLog.debug('Step 6: Getting book metadata...');
        const totalChapters = processor.getTotalChapters();
        const chapterTitles = (await processor.getChapterTitles()) as ChapterTitle[];

        appLog.debug('Step 6 complete: Book processed successfully:', {
          title: bookMetadata.title,
          totalChapters,
          chapterTitles: chapterTitles?.slice(0, 3) // Log first 3 titles
        });

        // Pre-load all chapters (for smaller books) or load them on-demand
        const chapters: string[] = [];
        if (totalChapters <= 10) {
          // Pre-load all chapters for small books
          appLog.debug('Step 7: Pre-loading all chapters for small book...');
          for (let i = 0; i < totalChapters; i++) {
            const chapterHtml = await processor.getChapterHtml(i);
            chapters[i] = chapterHtml || '';
          }
          appLog.debug('Step 7 complete: All chapters pre-loaded');
        } else {
          appLog.debug('Step 7: Skipping pre-load for large book (' + totalChapters + ' chapters)');
        }

        // Bail out if the user navigated away before load finished
        if (activeLoadRef.current?.requestId !== requestId) {
          appLog.debug(
            'useBookContent: Active book changed before load completed, ignoring results for:',
            requestId
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

        appLog.debug('✁EBook loading complete!');

        prevMetadataRef.current = {
          title: bookMetadata.title,
          fileType: bookMetadata.fileType,
          driveFileId: bookMetadata.driveFileId,
        };

      } catch (error) {
        console.error('❁EError loading book content:', error);
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
        if (process.env.NODE_ENV === 'development') {
          appLog.debug('Loading chapter content on-demand:', currentChapter);
        }
        const chapterHtml = await processorRef.current.getChapterHtml(currentChapter);
        setCurrentChapterContent(chapterHtml || '<p>Chapter content not available</p>');
      } catch (error) {
        console.error('Error loading chapter content:', error);
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
