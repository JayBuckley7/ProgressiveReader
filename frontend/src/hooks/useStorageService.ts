import { useState, useEffect, useRef, useCallback } from 'react';
import { storageService, BookMetadata, ReadingProgress } from '../services/storageService';
import { gDriveService } from '../services/gdriveService';
import { addOfflineBook, getOfflineBooksWithCovers } from '../utils/offlineLibrary';
import { getCoverForFile, getCachedCover, cacheCoverForFile, cacheCover } from '../services/driveCache';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { useOnlineStatus } from './useOnlineStatus';

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
  const isOnline = useOnlineStatus();

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

      const previous = booksRef.current;
      const coverMap = new Map(previous.map(b => [b.id, b.coverUrl]));

      // Always include offline books in silent refresh
      const offlineBooks = await getOfflineBooksWithCovers();

      const onCoverReady = (bookId: string, coverUrl: string) => {
        console.log(`[useStorageService] Cover ready for book ${bookId} (silent refresh)`);
        setBooks(currentBooks =>
          currentBooks.map(book =>
            book.id === bookId ? { ...book, coverUrl } : book
          )
        );
      };

      let userBooks: BookMetadata[] = [];
      try {
        userBooks = await storageService.getUserBooks(onCoverReady);
      } catch (error) {
        console.warn('Could not refresh cloud books, keeping offline books:', error);
      }

      // Merge offline and online books, removing duplicates (prioritize online version)
      const onlineBookIds = new Set(userBooks.map(b => b.id));
      const uniqueOfflineBooks = offlineBooks.filter(book => !onlineBookIds.has(book.id));
      const allBooks = [...userBooks, ...uniqueOfflineBooks];

      const mergedBooks = allBooks.map(book => {
        const cached = coverMap.get(book.id);
        return cached ? { ...book, coverUrl: cached } : book;
      });

      if (areBooksEqual(allBooks, previous)) {
        setBooks(mergedBooks);
        booksRef.current = mergedBooks;
      } else {
        const newIds = new Set(allBooks.map(b => b.id));
        const removed = previous.filter(b => !newIds.has(b.id));
        if (removed.length > 0) {
          storageService.cleanupBlobUrls(removed);
        }
        setBooks(mergedBooks);
        booksRef.current = mergedBooks;
      }

      console.log(`[useStorageService] Silent refresh complete - ${userBooks.length} cloud books, ${uniqueOfflineBooks.length} offline-only books`);
    } catch (error) {
      console.error('Error silently refreshing books:', error);
      // Don't show toast errors for silent refreshes to avoid interrupting user
    } finally {
      isRefreshingRef.current = false;
    }
  }, [clerkUser]);

  const loadOfflineBooks = useCallback(async () => {
    setIsLoading(true);
    const offline = await getOfflineBooksWithCovers();
    setBooks(offline);
    setIsLoading(false);
  }, []);

  // Load user books function - now includes offline books
  const loadUserBooks = useCallback(async () => {
    if (!clerkUser || isRefreshingRef.current) {
        setBooks([]);
        return;
    }
    setIsLoading(true);
    isRefreshingRef.current = true;
    
    if (!isOnline) {
      console.log('[useStorageService] Offline mode: loading local books only.');
      try {
        const offlineBooks = await getOfflineBooksWithCovers();
        setBooks(offlineBooks);
        console.log(`[useStorageService] Fallback: loaded ${offlineBooks.length} offline books`);
      } catch (offlineError) {
        console.error('Error loading offline books:', offlineError);
        toast.error('Failed to load your books');
        setBooks([]);
      }
      return;
    }
    
    try {
      const previous = booksRef.current;
      const coverMap = new Map(previous.map(b => [b.id, b.coverUrl]));

      // Always load offline books first
      const offlineBooks = await getOfflineBooksWithCovers();

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

      let userBooks: BookMetadata[] = [];
      try {
        userBooks = await storageService.getUserBooks(onCoverReady);
      } catch (error) {
        console.warn('Could not load cloud books, using offline books only:', error);
      }

      // Merge offline and online books, removing duplicates (prioritize online version)
      const onlineBookIds = new Set(userBooks.map(b => b.id));
      const uniqueOfflineBooks = offlineBooks.filter(book => !onlineBookIds.has(book.id));
      const allBooks = [...userBooks, ...uniqueOfflineBooks];

      const mergedBooks = allBooks.map(book => {
        const cached = coverMap.get(book.id);
        return cached ? { ...book, coverUrl: cached } : book;
      });

      if (areBooksEqual(allBooks, previous)) {
        setBooks(mergedBooks);
        booksRef.current = mergedBooks;
      } else {
        const newIds = new Set(allBooks.map(b => b.id));
        const removed = previous.filter(b => !newIds.has(b.id));
        if (removed.length > 0) {
          storageService.cleanupBlobUrls(removed);
        }
        setBooks(mergedBooks);
        booksRef.current = mergedBooks;
      }

      console.log(`[useStorageService] Loaded ${userBooks.length} cloud books and ${uniqueOfflineBooks.length} offline-only books`);
    } catch (error) {
      console.error('Error loading books:', error);
      
      // Fallback to offline books only
      try {
        const offlineBooks = await getOfflineBooksWithCovers();
        setBooks(offlineBooks);
        console.log(`[useStorageService] Fallback: loaded ${offlineBooks.length} offline books`);
      } catch (offlineError) {
        console.error('Error loading offline books:', offlineError);
        toast.error('Failed to load your books');
        setBooks([]);
      }
    } finally {
      setIsLoading(false);
      isRefreshingRef.current = false;
    }
  }, [clerkUser, isOnline]);

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

        getOfflineBooksWithCovers().then(b => {
          setBooks(b);
          setIsLoading(false);
        });
      }
    }
  }, [clerkUser?.id, clerkLoaded, loadUserBooks]); // Use user ID instead of user object

  useEffect(() => {
    if (!clerkUser && clerkLoaded) {
      loadOfflineBooks();
    }
  }, [clerkUser, clerkLoaded, loadOfflineBooks]);

  // Listen for Google Drive sign-in status changes and auto-refresh books
  // OPTIMIZATION: Prevent redundant listener setup and unnecessary book refreshes
  useEffect(() => {
    if (!clerkUser) return;

    console.log('[useStorageService] Setting up Google Drive sign-in listener...');

    // Track if we've already loaded books to prevent unnecessary refreshes
    let hasLoadedBooks = books.length > 0;

    // Listen for Google Drive connection status changes
    const unsubscribe = gDriveService.listenToSigninStatus((isSignedIn) => {
      console.log(`[useStorageService] Google Drive sign-in status changed: ${isSignedIn}`);

      if (isSignedIn && !hasLoadedBooks) {
        // Only refresh books if we haven't loaded them yet
        console.log('[useStorageService] Google Drive connected - refreshing book list...');
        hasLoadedBooks = true;
        silentRefreshBooks();
      } else if (isSignedIn && hasLoadedBooks) {
        console.log('[useStorageService] Google Drive connected but books already loaded, skipping refresh');
      }
    });

    // Cleanup listener on component unmount or user change
    return () => {
      console.log('[useStorageService] Cleaning up Google Drive sign-in listener');
      unsubscribe();
    };
  }, [clerkUser?.id]); // Remove silentRefreshBooks dependency to prevent recreation

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
    // If offline or no user, store locally
    if (!isOnline || !clerkUser) {
      try {
        // Create a local book metadata object
        const localBookId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const localBookMetadata: BookMetadata = {
          id: localBookId,
          title: meta.title,
          fileType: meta.fileType,
          uploadedAt: new Date(),
          userId: clerkUser?.id || 'local',
          cloudProvider: 'local',
          totalChapters: 1 // Default, can be updated later
        };

        // Cache the book content
        const { cacheFile } = await import('../services/driveCache');
        await cacheFile(localBookId, file);

        // Cache the cover if provided
        if (meta.cover) {
          const { cacheCoverForFile } = await import('../services/driveCache');
          await cacheCoverForFile(localBookId, meta.cover);
          localBookMetadata.coverUrl = URL.createObjectURL(meta.cover);
        }

        // Add to offline books
        addOfflineBook(localBookMetadata);

        // Refresh the book list
        if (clerkUser) {
          await silentRefreshBooks();
        } else {
          await loadOfflineBooks();
        }

        const message = !isOnline ? 
          'Book uploaded locally (offline mode)' : 
          'Book uploaded locally';
        toast.success(message);
        return localBookMetadata;
      } catch (error) {
        console.error('Error uploading book locally:', error);
        toast.error('Failed to upload book locally');
        throw error;
      }
    }

    // Online upload with user signed in
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
    // Deduplication logic
    let promise = activeDownloads.get(bookId);
    if (promise) {
      return promise;
    }

    const doDownload = async () => {
      try {
        const cachedBlob = await getCachedFile(bookId);
        if (cachedBlob) {
          console.log(`[useStorageService] Book ${bookId} found in local cache.`);
          return cachedBlob;
        }

        const message = !isOnline ?
          "You are offline. This book is not in your cache." :
          "This book is not in your local cache. Download from cloud?";
        
        if (!isOnline) {
          toast.error(message);
          return null;
        }

        const shouldDownload = window.confirm(message);
        if (!shouldDownload) return null;

        const cloudBlob = await storageService.downloadBook(bookId, metadata);
        if (cloudBlob) {
          await cacheFile(bookId, cloudBlob);
          return cloudBlob;
        }
        return null;
      } finally {
        activeDownloads.delete(bookId);
      }
    };

    promise = doDownload();
    activeDownloads.set(bookId, promise);
    return promise;
  };

  const downloadBookForOffline = async (meta: BookMetadata) => {
    try {
      if (!isOnline && !await getCachedFile(meta.id)) {
        toast.error('You must be online to download a book for the first time.');
        return;
      }

      const blob = await downloadBook(meta.id, meta);
      if (blob) {
        // Cache the actual book content in IndexedDB using driveCache
        const { cacheFile } = await import('../services/driveCache');
        await cacheFile(meta.id, blob);
        if (meta.driveFileId && meta.driveFileId !== meta.id) {
          await cacheFile(meta.driveFileId, blob);
        }

        if (meta.coverImageId) {
          let cover = await getCoverForFile(meta.id);
          if (!cover) {
            cover = await getCachedCover(meta.coverImageId);
            if (!cover && gDriveService.isSignedIn()) {
              cover = await gDriveService.downloadFile(meta.coverImageId);
              if (cover) {
                await cacheCover(meta.coverImageId, cover);
              }
            }
            if (cover) {
              await cacheCoverForFile(meta.id, cover);
            }
          }
        }
        addOfflineBook(meta);
        
        // Refresh the book list to show the newly cached book
        if (clerkUser) {
          await silentRefreshBooks();
        } else {
          await loadOfflineBooks();
        }
        
        toast.success('Book cached for offline use');
      }
    } catch (error) {
      console.error('Error downloading book for offline:', error);
      toast.error('Failed to download book for offline use');
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
      try {
        await window.Clerk.signOut();
      } catch (error) {
        console.warn('Clerk sign-out failed (possibly offline):', error);
      }

      setBooks([]); // Clear books when signing out
      lastUserIdRef.current = null;

      // SECURITY: Clear Google Drive tokens when Clerk user signs out
      // This prevents token leakage between different user sessions
      const { gDriveService } = await import('../services/gdriveService');
      gDriveService.onClerkSignOut();

      // Clear persisted settings
      document.cookie = 'prSettings=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      localStorage.removeItem('prSettings');
      localStorage.removeItem('showPopupOnHover');
      localStorage.removeItem('touchscreenSupport');
      localStorage.removeItem('disableFadeAnimation');
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
      toast.error('Please sign in to save settings');
      return false;
    }

    try {
      await storageService.saveSettings(settings);
      toast.success('Settings saved');
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
      return false;
    }
  };

  const loadSettings = async (): Promise<any | null> => {
    if (!clerkUser) {
      console.log('User not signed in, cannot load cloud settings');
      return null;
    }

    try {
      const settings = await storageService.loadSettings();
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
    downloadBookForOffline,
    saveSettings,
    loadSettings,
    loadOfflineBooks
  };
}
