import { useState, useEffect, useRef, useCallback } from 'react';
import { storageService, BookMetadata, ReadingProgress } from '../services/storageService';
import { gDriveService } from '../services/gdriveService';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';

/**
 * Determine if two book lists contain the same entries.
 * Order is ignored and only stable fields are compared.
 */
function areBooksEqual(a: BookMetadata[], b: BookMetadata[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    const serialize = (arr: BookMetadata[]) =>
        arr
            .map(book => `${book.id}-${book.title}-${book.fileType}-${book.coverImageId ?? ''}`)
            .sort()
            .join('|');
    return serialize(a) === serialize(b);
}

export function useStorageService() {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const [isLoading, setIsLoading] = useState(true);
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const booksRef = useRef<BookMetadata[]>([]);
  const isRefreshingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  // Memoize the silent refresh function to prevent recreation on every render
  const silentRefreshBooks = useCallback(async () => {
    if (!clerkUser || isRefreshingRef.current) {
      return;
    }
    
    try {
      isRefreshingRef.current = true;
      console.log('[useStorageService] Silently refreshing books...');

      const onCoverReady = (bookId: string, coverUrl: string) => {
        console.log(`[useStorageService] Cover ready for book ${bookId} (silent refresh)`);
        setBooks(currentBooks =>
          currentBooks.map(book =>
            book.id === bookId ? { ...book, coverUrl } : book
          )
        );
      };

      const userBooks = await storageService.getUserBooks(onCoverReady);

      if (areBooksEqual(userBooks, booksRef.current)) {
        console.log('[useStorageService] Library unchanged - skipping update');
      } else {
        if (booksRef.current.length > 0) {
          storageService.cleanupBlobUrls(booksRef.current);
        }
        setBooks(userBooks);
        booksRef.current = userBooks;
      }

      console.log(`[useStorageService] Silent refresh complete - found ${userBooks.length} books`);
    } catch (error) {
      console.error('Error silently refreshing books:', error);
      // Don't show toast errors for silent refreshes to avoid interrupting user
    } finally {
      isRefreshingRef.current = false;
    }
  }, [clerkUser]);

  // Load user books function
  const loadUserBooks = useCallback(async () => {
    if (!clerkUser || isRefreshingRef.current) {
        setBooks([]);
        return;
    }
    setIsLoading(true);
    isRefreshingRef.current = true;
    
    try {
      const previous = booksRef.current;

      const coverMap = new Map(previous.map(b => [b.id, b.coverUrl]));

      // Callback to update individual book covers as they become ready
      const onCoverReady = (bookId: string, coverUrl: string) => {
        console.log(`[useStorageService] Cover ready for book ${bookId}`);
        setBooks(currentBooks =>
          currentBooks.map(book =>
            book.id === bookId
              ? { ...book, coverUrl }
              : book
          )
        );
      };

      const userBooks = await storageService.getUserBooks(onCoverReady);

      const mergedBooks = userBooks.map(book => {
        const cached = coverMap.get(book.id);
        return cached ? { ...book, coverUrl: cached } : book;
      });

      if (areBooksEqual(userBooks, previous)) {
        setBooks(mergedBooks);
        booksRef.current = mergedBooks;
      } else {
        const newIds = new Set(userBooks.map(b => b.id));
        const removed = previous.filter(b => !newIds.has(b.id));
        if (removed.length > 0) {
          storageService.cleanupBlobUrls(removed);
        }
        setBooks(mergedBooks);
        booksRef.current = mergedBooks;
      }
    } catch (error) {
      console.error('Error loading books:', error);
      
      // Since we're not using backend API, just show a generic error
      toast.error('Failed to load your books');
      setBooks([]);
    } finally {
      setIsLoading(false);
      isRefreshingRef.current = false;
    }
  }, [clerkUser]);

  useEffect(() => {
    // Use Clerk's authentication state instead of Firebase
    if (clerkLoaded) {
      setIsLoading(false);
      if (clerkUser) {
        // Check if this is a different user to avoid redundant loads
        const currentUserId = clerkUser.id;
        if (lastUserIdRef.current !== currentUserId) {
          console.log('User signed in with Clerk:', clerkUser);
          lastUserIdRef.current = currentUserId;
          loadUserBooks();
        }
      } else {
        // User is not signed in - clear everything for security
        console.log('User not signed in with Clerk - clearing data for security');
        
        // Clean up blob URLs before clearing books
        if (books.length > 0) {
          storageService.cleanupBlobUrls(books);
        }
        
        setBooks([]);
        lastUserIdRef.current = null;
        
        // SECURITY: Clear Google Drive tokens when no Clerk user
        // This prevents token leakage if user switches accounts
        import('../services/gdriveService').then(({ gDriveService }) => {
          gDriveService.onClerkSignOut();
        });
      }
    }
  }, [clerkUser?.id, clerkLoaded, loadUserBooks]); // Use user ID instead of user object

  // Listen for Google Drive sign-in status changes and auto-refresh books
  useEffect(() => {
    if (!clerkUser) return;

    console.log('[useStorageService] Setting up Google Drive sign-in listener...');

    // Listen for Google Drive connection status changes
    const unsubscribe = gDriveService.listenToSigninStatus((isSignedIn) => {
      console.log(`[useStorageService] Google Drive sign-in status changed: ${isSignedIn}`);

      if (isSignedIn) {
        // When Google Drive connects, refresh the book list so the library updates
        console.log('[useStorageService] Google Drive connected - refreshing book list...');
        silentRefreshBooks();
      }
    });

    // Cleanup listener on component unmount or user change
    return () => {
      console.log('[useStorageService] Cleaning up Google Drive sign-in listener');
      unsubscribe();
    };
  }, [clerkUser?.id, silentRefreshBooks]); // Use user ID instead of user object

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Clean up any remaining blob URLs on unmount
      if (books.length > 0) {
        storageService.cleanupBlobUrls(books);
      }
    };
  }, [books]);

  const uploadBook = async (file: File, meta: {title: string; fileType: string; cover?: Blob}) => {
    if (!clerkUser) {
      toast.error('Please sign in to upload books');
      return null;
    }

    try {
      const book = await storageService.uploadBook(file, meta, clerkUser);
      await loadUserBooks(); // Refresh the list
      toast.success('Book uploaded successfully to your cloud storage!');
      return book;
    } catch (error) {
      console.error('Error uploading book:', error);
      toast.error('Failed to upload book to cloud storage');
      throw error;
    }
  };

  const downloadBook = async (bookId: string, metadata: BookMetadata): Promise<Blob | null> => {
    if (!clerkUser) {
      toast.error('Please sign in to download books');
      return null;
    }

    try {
      return await storageService.downloadBook(bookId, metadata);
    } catch (error) {
      console.error('Error downloading book:', error);
      toast.error('Failed to download book from cloud storage');
      throw error;
    }
  };

  const deleteBook = async (id: string) => {
    if (!clerkUser) {
      toast.error('Please sign in to delete books');
      return;
    }
    setIsLoading(true);
    try {
      await storageService.deleteBook(id);
      // Refresh books after delete
      await silentRefreshBooks();
      toast.success('Book deleted successfully');
    } catch (error) {
      console.error('Error deleting book:', error);
      toast.error('Failed to delete book');
    } finally {
      setIsLoading(false);
    }
  };

  const updateBookCover = async (bookId: string, coverFile: File) => {
    if (!clerkUser) {
      toast.error('Please sign in to update book covers');
      return;
    }
    
    try {
      const newCoverImageId = await storageService.updateBookCover(bookId, coverFile);
      // Refresh books to show the new cover
      await silentRefreshBooks();
      toast.success('Book cover updated successfully');
      return newCoverImageId;
    } catch (error) {
      console.error('Error updating book cover:', error);
      toast.error('Failed to update book cover');
      throw error;
    }
  };

  const getReadingProgress = async (bookId: string): Promise<ReadingProgress | null> => {
    if (!clerkUser) return null;
    
    try {
      return await storageService.getReadingProgress(bookId);
    } catch (error) {
      console.error('Error getting reading progress:', error);
      return null;
    }
  };

  const saveReadingProgress = async (progress: ReadingProgress) => {
    if (!clerkUser) return;
    
    try {
      await storageService.saveReadingProgress(progress);
    } catch (error) {
      console.error('Error saving reading progress:', error);
      toast.error('Failed to save reading progress');
    }
  };

  const signIn = async () => {
    // Redirect to Clerk's sign-in page
    if (window.Clerk) {
      window.Clerk.redirectToSignIn();
    } else {
      toast.error('Authentication system not loaded yet');
    }
  };

  const signOut = async () => {
    // Sign out using Clerk
    if (window.Clerk) {
      await window.Clerk.signOut();
      setBooks([]); // Clear books when signing out
      lastUserIdRef.current = null;

      // SECURITY: Clear Google Drive tokens when Clerk user signs out
      // This prevents token leakage between different user sessions
      const { gDriveService } = await import('../services/gdriveService');
      gDriveService.onClerkSignOut();

      // Clear persisted settings
      document.cookie = 'prSettings=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    } else {
      toast.error('Authentication system not loaded yet');
    }
  };

  const openCloudFolder = async () => {
    if (!clerkUser) {
      toast.error('Please sign in to access your cloud storage folder');
      return;
    }

    try {
      await storageService.openCloudFolder(clerkUser);
    } catch (error) {
      console.error('Error opening cloud folder:', error);
      toast.error('Failed to open cloud storage folder');
    }
  };

  const syncBooks = async () => {
    if (!clerkUser) {
      toast.error('Please sign in to sync your books');
      return;
    }

    setIsLoading(true);
    try {
      const onCoverReady = (bookId: string, coverUrl: string) => {
        setBooks((current) =>
          current.map((b) => (b.id === bookId ? { ...b, coverUrl } : b))
        );
      };

      const synced = await storageService.syncBooks(clerkUser, onCoverReady);
      setBooks(synced);
      toast.success('Library synced successfully');
    } catch (error) {
      console.error('Error syncing books:', error);
      toast.error('Failed to sync books');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (settings: any) => {
    if (!clerkUser) {
      toast.error('Please sign in to save settings to cloud storage');
      return false;
    }

    try {
      await storageService.saveSettings(settings, clerkUser);
      toast.success('Settings saved to cloud storage');
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings to cloud storage');
      return false;
    }
  };

  const loadSettings = async (): Promise<any | null> => {
    if (!clerkUser) {
      console.log('User not signed in, cannot load cloud settings');
      return null;
    }

    try {
      const settings = await storageService.loadSettings(clerkUser);
      return settings;
    } catch (error) {
      console.error('Error loading settings:', error);
      // Don't show error toast for settings loading failure - just use defaults
      return null;
    }
  };

  return {
    books,
    isLoading,
    isAuthenticated: !!clerkUser && clerkLoaded,
    signIn,
    signOut,
    uploadBook,
    downloadBook,
    deleteBook,
    updateBookCover,
    getReadingProgress,
    saveReadingProgress,
    openCloudFolder,
    syncBooks,
    saveSettings,
    loadSettings
  };
}
