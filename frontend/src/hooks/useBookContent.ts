import { useState, useEffect, useRef, useMemo } from 'react';
import { BookMetadata, storageService } from '~/services/storageService.ts';
import { useStorageService } from '~/hooks/useStorageService.ts';
import { EpubProcessorWrapper } from '~/lib/epubProcessor.ts';
import { TextProcessorWrapper } from '~/lib/textProcessor.ts';

import type { ChapterTitle } from '~/types/index.ts';

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
  const { books } = useStorageService();
  const [bookContent, setBookContent] = useState<BookContent | null>(null);
  const [currentChapterContent, setCurrentChapterContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const processorRef = useRef<any>(null);
  const loadedBookIdRef = useRef<string | null>(null);

  // Add debug logging to track hook execution
  console.log(`📚 [useBookContent] Hook called for bookId: ${bookId}, chapter: ${currentChapter}, books.length: ${books.length}`);

  // Memoize the book metadata to prevent unnecessary re-renders
  const bookMetadata = useMemo(() => {
    const metadata = books.find(book => book.id === bookId);
    console.log(`📚 [useBookContent] Book metadata lookup result:`, metadata ? 'Found' : 'Not found');
    return metadata;
  }, [books, bookId]);

  // Get the book processors (now directly imported)
  const getProcessors = () => {
    console.log('Getting processor classes...');
    return {
      EpubProcessorWrapper,
      TextProcessorWrapper
    };
  };

  // Load and process the book
  useEffect(() => {
    // Skip if no metadata or if this book is already loaded
    if (!bookMetadata) {
      console.warn('useBookContent: No book metadata found for bookId:', bookId);
      setError('Book not found');
      setIsLoading(false);
      return;
    }

    // Skip if this book is already loaded to prevent redundant processing
    if (loadedBookIdRef.current === bookId && bookContent) {
      console.log('useBookContent: Book already loaded, skipping reload for:', bookId);
      setIsLoading(false);
      return;
    }

    // Skip if already loading this book to prevent duplicate loading
    if (isLoading && loadedBookIdRef.current === bookId) {
      console.log('useBookContent: Book is already loading, skipping duplicate request for:', bookId);
      return;
    }

    const loadBook = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('Loading book content for:', bookMetadata.title, 'ID:', bookId);
        console.log('Book metadata:', bookMetadata);

        // Get the processors
        console.log('Step 1: Getting processors...');
        const processors = getProcessors();
        console.log('Step 1 complete: Processors available');

        // Download book content from Google Drive
        console.log('Step 2: Downloading book from Google Drive...');
        const bookBlob = await storageService.downloadBook(bookId, bookMetadata);
        if (!bookBlob) {
          throw new Error('Failed to download book content');
        }

        console.log('Step 2 complete: Book downloaded successfully, size:', bookBlob.size, 'type:', bookBlob.type);

        // Convert blob to ArrayBuffer
        console.log('Step 3: Converting blob to ArrayBuffer...');
        const arrayBuffer = await bookBlob.arrayBuffer();
        console.log('Step 3 complete: ArrayBuffer size:', arrayBuffer.byteLength);

        // Choose the appropriate processor based on file type
        console.log('Step 4: Creating processor for file type:', bookMetadata.fileType);
        let processor: EpubProcessorWrapper | TextProcessorWrapper;
        let loaded: boolean;
        
        if (bookMetadata.fileType === 'txt' || bookMetadata.fileType === 'docx' || bookMetadata.fileType === 'pdf') {
          processor = new processors.TextProcessorWrapper();
          console.log('Step 4 complete: Created TextProcessorWrapper');
          
          // Load the book with the text processor
          console.log('Step 5: Loading book with TextProcessorWrapper...');
          loaded = await processor.loadBook(arrayBuffer, { fileType: bookMetadata.fileType });
        } else {
          // Default to EPUB
          processor = new processors.EpubProcessorWrapper();
          console.log('Step 4 complete: Created EpubProcessorWrapper');
          
          // Load the book with the EPUB processor
          console.log('Step 5: Loading book with EpubProcessorWrapper...');
          loaded = await processor.loadBook(arrayBuffer);
        }
        if (!loaded) {
          throw new Error(`Failed to load book using ${processor.constructor.name}`);
        }
        console.log('Step 5 complete: Book loaded with processor');

        processorRef.current = processor;

        // Get book metadata
        console.log('Step 6: Getting book metadata...');
        const totalChapters = processor.getTotalChapters();
        const chapterTitles = (await processor.getChapterTitles()) as ChapterTitle[];

        console.log('Step 6 complete: Book processed successfully:', {
          title: bookMetadata.title,
          totalChapters,
          chapterTitles: chapterTitles?.slice(0, 3) // Log first 3 titles
        });

        // Pre-load all chapters (for smaller books) or load them on-demand
        const chapters: string[] = [];
        if (totalChapters <= 10) {
          // Pre-load all chapters for small books
          console.log('Step 7: Pre-loading all chapters for small book...');
          for (let i = 0; i < totalChapters; i++) {
            const chapterHtml = await processor.getChapterHtml(i);
            chapters[i] = chapterHtml || '';
          }
          console.log('Step 7 complete: All chapters pre-loaded');
        } else {
          console.log('Step 7: Skipping pre-load for large book (' + totalChapters + ' chapters)');
        }

        setBookContent({
          title: bookMetadata.title,
          totalChapters,
          chapters,
          chapterTitles: chapterTitles || []
        });

        // Mark this book as loaded
        loadedBookIdRef.current = bookId;

        console.log('✅ Book loading complete!');

              } catch (error) {
          console.error('❌ Error loading book content:', error);
          setError(error instanceof Error ? error.message : 'Failed to load book');
          loadedBookIdRef.current = null; // Reset on error
      } finally {
        setIsLoading(false);
      }
    };

    loadBook();
  }, [bookId, bookMetadata?.title, bookMetadata?.fileType, bookMetadata?.driveFileId]); // More specific dependencies

  // Reset loaded book reference when bookId changes
  useEffect(() => {
    if (loadedBookIdRef.current !== bookId) {
      loadedBookIdRef.current = null;
      setBookContent(null);
      setCurrentChapterContent(null);
      processorRef.current = null;
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
        console.log('Loading chapter content on-demand:', currentChapter);
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