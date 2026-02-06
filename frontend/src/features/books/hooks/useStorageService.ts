import { useState, useEffect, useRef, useCallback } from 'react';
import type { BookMetadata, ReadingProgress, Folder } from '~/types';
import { bookStorageService } from '@features/books/services/bookStorage';
import { bookMetadataService } from '@features/books/services/bookMetadata';
import { bookCacheService } from '@features/books/services/bookCache';
import { gDriveService } from '@integrations/googleDrive/gdriveService';
import { authManager } from '@shared/services/authManager';
import { addOfflineBook, getOfflineBooksWithCovers, OFFLINE_BOOKS_KEY, getOfflineBooks } from '@features/books/utils/offlineLibrary';
import { getCoverForFile, getCachedCover, cacheCoverForFile, cacheCover, clearAllCache } from '@integrations/googleDrive/services/driveCache';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { appLog } from '@shared/appLog'

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

function useStorageService() {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const [isLoading, setIsLoading] = useState(true);
  const [isDriveBookLoading, setIsDriveBookLoading] = useState(false);
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const booksRef = useRef<BookMetadata[]>([]);
  const isRefreshingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  const SESSION_COOLDOWN = 30_000;
  const lastSessionToastRef = useRef(0);
  const isDriveSyncingRef = useRef(false);

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
      if (process.env.NODE_ENV === 'development') {
        appLog.debug('[useStorageService] Silently refreshing books...');
      }

      const previous = booksRef.current;

      const onCoverReady = (bookId: string, coverUrl: string) => {
        appLog.debug(`[useStorageService] Cover ready for book ${bookId} (silent refresh)`);
        setBooks(currentBooks => {
          const updatedBooks = currentBooks.map(book =>
            book.id === bookId ? { ...book, coverUrl } : book
          );
          appLog.debug(`[useStorageService] Updated books state for cover ${bookId} (silent refresh) - Total books: ${updatedBooks.length}`);
          return updatedBooks;
        });
      };

      const userBooks = await bookMetadataService.getUserBooks(onCoverReady);

      // No need to merge covers manually - storageService handles persistent URLs
      if (areBooksEqual(userBooks, previous)) {
        setBooks(userBooks);
        booksRef.current = userBooks;
      } else {
        const newIds = new Set(userBooks.map(b => b.id));
        const removed = previous.filter(b => !newIds.has(b.id));
        if (removed.length > 0) {
          bookCacheService.cleanupBlobUrls(removed);
        }
        setBooks(userBooks);
        booksRef.current = userBooks;
      }

      if (process.env.NODE_ENV === 'development') {
        appLog.debug(`[useStorageService] Silent refresh complete - found ${userBooks.length} books`);
      }

      // Show success feedback only
      if (userBooks.length > 0) {
        toast.success(`✅ Loaded ${userBooks.length} book${userBooks.length === 1 ? '' : 's'} from Google Drive`);
      }
    } catch (error) {
      console.error('Error silently refreshing books:', error);
      toast.error('Failed to load books from Google Drive');
    } finally {
      isRefreshingRef.current = false;
      setIsDriveBookLoading(false);
    }
  }, [clerkUser]);

  const loadOfflineBooks = useCallback(async () => {
    setIsLoading(true);
    const offline = await getOfflineBooksWithCovers();
    setBooks(offline);
    setIsLoading(false);
  }, []);

  // Simple function: authenticate first, then load everything
  const connectToGoogleDriveAndLoad = useCallback(async () => {
    if (!clerkUser || isRefreshingRef.current) {
      appLog.debug('[useStorageService] Cannot connect: no Clerk user or already loading');
      return false;
    }

    appLog.debug('[useStorageService] 🔐 User requested Google Drive connection - starting auth sequence...');
    setIsLoading(true);
    setIsDriveBookLoading(true);
    isRefreshingRef.current = true;
    isDriveSyncingRef.current = true;

    try {
      // Step 1: Authenticate FIRST
      appLog.debug('[useStorageService] Step 1: Authenticating with Google Drive...');
      const isAuthenticated = await authManager.ensureAuthenticated();
      if (!isAuthenticated) {
        appLog.debug('[useStorageService] ❌ Authentication failed');
        toast.error('Failed to connect to Google Drive');
        return false;
      }
      appLog.debug('[useStorageService] ✅ Google Drive authenticated successfully');

      // Step 2: Load data AFTER authentication
      appLog.debug('[useStorageService] Step 2: Loading your books and folders...');
      const previous = booksRef.current;

      const onCoverReady = (bookId: string, coverUrl: string) => {
        appLog.debug(`[useStorageService] Cover ready for book ${bookId}`);
        // Use a ref to batch cover updates and reduce re-renders
        setBooks(currentBooks => {
          const updatedBooks = currentBooks.map(book =>
            book.id === bookId ? { ...book, coverUrl } : book
          );
          return updatedBooks;
        });
      };

      const [userBooks, userFolders] = await Promise.all([
        bookMetadataService.getUserBooks(onCoverReady),
        bookMetadataService.getFolders(clerkUser)
      ]);

      appLog.debug(`[useStorageService] ✅ Loaded ${userBooks.length} books and ${userFolders.length} folders`);

      if (areBooksEqual(userBooks, previous)) {
        setBooks(userBooks);
        booksRef.current = userBooks;
      } else {
        const newIds = new Set(userBooks.map(b => b.id));
        const removed = previous.filter(b => !newIds.has(b.id));
        if (removed.length > 0) {
          bookCacheService.cleanupBlobUrls(removed);
        }
        setBooks(userBooks);
        booksRef.current = userBooks;
      }

      setFolders(userFolders);

      // Remember that user successfully connected
      localStorage.setItem('wasGoogleDriveConnected', 'true');

      toast.success('Google Drive connected and library loaded!');
      return true;
    } catch (error) {
      console.error('[useStorageService] ❌ Error during Google Drive connection:', error);
      toast.error('Failed to connect to Google Drive - showing offline books');
      await loadOfflineBooks();
      return false;
    } finally {
      setIsLoading(false);
      setIsDriveBookLoading(false);
      isRefreshingRef.current = false;
      isDriveSyncingRef.current = false;
    }
  }, [clerkUser]);

  // Legacy function that calls the new one
  const loadUserBooks = useCallback(async () => {
    return await connectToGoogleDriveAndLoad();
  }, [connectToGoogleDriveAndLoad]);

  // Check online status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // 🚨 RACE CONDITION FIX 🚨
    // Previously, there was an automatic effect that tried to connect to Google Drive
    // immediately when a user signed in with Google OAuth through Clerk. This caused
    // a race condition where the effect ran before Clerk had fully finalized the
    // user session, resulting in "valid tokens being cleared" as noted in GitHub issues.
    // 
    // SOLUTION: We now use a coordinated approach:
    // 1. Only auto-connect on specific pages that need books (not admin pages)
    // 2. Add a 1-second delay to ensure Clerk is fully ready
    // 3. Let the storage service handle authentication to avoid competing flows
    // 4. Prefer manual user-triggered connection over automatic connection
    //
    // This prevents multiple parts of the app from trying to manage authentication
    // simultaneously and ensures proper state coordination.

    // Only log auth status in development mode to reduce spam
    if (process.env.NODE_ENV === 'development') {
      appLog.debug(`[👤 CLERK AUTH] Status: loaded=${clerkLoaded}, user=${!!clerkUser}, userId=${clerkUser?.id}`);
    }
    if (clerkLoaded) {
      setIsLoading(false);
      if (clerkUser) {
        // Check if this is a different user to avoid redundant loads
        const currentUserId = clerkUser.id;
        if (lastUserIdRef.current !== currentUserId) {
          appLog.debug('[👤 CLERK AUTH] ✅ User signed in with Clerk:', clerkUser);
          lastUserIdRef.current = currentUserId;

          // Check if user signed in with Google via Clerk (has Google external account)
          const wasGoogleClerkLogin = clerkUser.externalAccounts?.some(
            (acc) => acc.provider.startsWith("google")
          );

          if (wasGoogleClerkLogin) {
            // Only auto-connect to Google Drive if user is on a page that needs books
            // Don't auto-connect on admin pages or other non-library pages
            const currentPath = window.location.pathname;
            const needsBooks = currentPath === '/' || currentPath.startsWith('/vocabulary') || currentPath.startsWith('/book/');

            appLog.debug(`[👤 CLERK AUTH] Current path: '${currentPath}', needsBooks: ${needsBooks}`);

            if (needsBooks) {
              appLog.debug('[👤 CLERK AUTH] ✅ User signed in with Google via Clerk - auto-connecting to Google Drive...');
              // Auto-connect to Google Drive after a small delay to ensure Clerk is fully ready
              setTimeout(() => {
                connectToGoogleDriveAndLoad();
              }, 1000); // 1 second delay to ensure Clerk is fully ready
            } else {
              appLog.debug(`[👤 CLERK AUTH] User on ${currentPath} - skipping auto Google Drive connection`);
            }
          } else {
            appLog.debug('[👤 CLERK AUTH] User did not sign in with Google, skipping Google Drive auto-connect');
          }
        }
      } else {
        // User is not signed in
        if (!isOnline) {
          // OFFLINE MODE: Only load offline books if we are TRULY offline
          const offlineBooks = getOfflineBooks();

          if (offlineBooks.length > 0) {
            appLog.debug('[useStorageService] User offline/unauthenticated but has cached books - loading offline mode');
            // Don't clear books, instead ensure they are loaded
            // We rely on "signOut" to explicitly clear this cache if the user truly wants to logout
            loadOfflineBooks();
          }
        } else {
          // ONLINE MODE: User is not signed in and is online -> Force fresh state for Sign In
          appLog.debug('User not signed in with Clerk and is Online - enforcing secure state');

          // Clean up blob URLs before clearing books
          if (books.length > 0) {
            bookCacheService.cleanupBlobUrls(books);
          }

          setBooks([]);
          lastUserIdRef.current = null;
        }
      }
    }
  }, [clerkUser?.id, clerkLoaded, loadUserBooks, loadOfflineBooks, isOnline]); // Added isOnline dependency

  // Listen for authentication state changes but DON'T auto-load data
  useEffect(() => {
    if (!clerkUser) return;

    //// appLog.debug('[🔐 GOOGLE DRIVE AUTH] Setting up auth listener (manual mode - no auto-loading)...');

    const unsubscribe = authManager.onAuthStateChange((isAuthenticated) => {
      appLog.debug(`[🔐 GOOGLE DRIVE AUTH] Auth state changed: ${isAuthenticated}`);
      // Just log the state change, don't auto-load anything
      // The user will manually trigger connectToGoogleDriveAndLoad when they want to
    });

    return () => {
      appLog.debug('[useStorageService] Cleaning up auth listener');
      unsubscribe();
    };
  }, [clerkUser?.id]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Clean up any remaining blob URLs on unmount
      if (books.length > 0) {
        bookCacheService.cleanupBlobUrls(books);
      }
    };
  }, [books]);

  const uploadBook = async (
    file: File,
    meta: { title: string; fileType: string; cover?: Blob; processOCR?: boolean },
    onOCRProgress?: (progress: { page?: number; total?: number; percent?: number }) => void
  ) => {
    if (!clerkUser) {
      toast.error('Please sign in to upload books');
      return null;
    }

    try {
      const book = await bookMetadataService.uploadBook(file, meta, clerkUser, onOCRProgress);
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
      return await bookStorageService.downloadBook(bookId, metadata);
    } catch (error) {
      console.error('Error downloading book:', error);
      toast.error('Failed to download book from cloud storage');
      throw error;
    }
  };

  const downloadBookForOffline = async (meta: BookMetadata) => {
    const blob = await downloadBook(meta.id, meta);
    if (!blob) return;

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
    toast.success('Book cached for offline use');
  };

  const deleteBook = async (id: string) => {
    if (!clerkUser) {
      toast.error('Please sign in to delete books');
      return;
    }
    setIsLoading(true);
    try {
      await bookMetadataService.deleteBook(id);
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
      const newCoverImageId = await bookMetadataService.updateBookCover(bookId, coverFile);
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
    try {
      return await bookStorageService.getReadingProgress(bookId);
    } catch (error) {
      console.error('Error getting reading progress:', error);
      return null;
    }
  };

  const saveReadingProgress = async (progress: ReadingProgress) => {
    try {
      await bookStorageService.saveReadingProgress(progress);
    } catch (error) {
      console.error('Error saving reading progress:', error);
    }
  };

  const saveBookProgress = async (
    bookId: string,
    currentChapter: number,
    currentPosition: number = 0,
    currentPage?: number,
    totalPages?: number,
    fileType?: string
  ): Promise<void> => {
    try {
      await bookStorageService.saveBookProgress(bookId, currentChapter, currentPosition, currentPage, totalPages, fileType);
    } catch (error) {
      console.error('Error saving book progress:', error);
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
      lastSessionToastRef.current = 0;

      // SECURITY: Clear Google Drive tokens when Clerk user signs out
      // This prevents token leakage between different user sessions
      gDriveService.onClerkSignOut();

      // SECURITY: Explicitly wipe all local data to prevent access by next user
      localStorage.removeItem(OFFLINE_BOOKS_KEY);

      // Clear all reading progress from localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('reading_progress_')) {
          localStorage.removeItem(key);
        }
      });

      // Clear IndexedDB (files and covers)
      try {
        await clearAllCache();
        appLog.debug('✅ Secure logout: Local cache wiped');
      } catch (e) {
        console.error('Failed to wipe cache on logout:', e);
      }

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
      await bookMetadataService.openCloudFolder(clerkUser);
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
    isDriveSyncingRef.current = true;
    try {
      const onCoverReady = (bookId: string, coverUrl: string) => {
        appLog.debug(`[useStorageService] Cover ready for book ${bookId} (sync) - URL: ${coverUrl.substring(0, 50)}...`);
        setBooks((current) => {
          const updatedBooks = current.map((b) => (b.id === bookId ? { ...b, coverUrl } : b));
          appLog.debug(`[useStorageService] Updated books state for cover ${bookId} (sync) - Total books: ${updatedBooks.length}`);
          return updatedBooks;
        });
      };

      const synced = await bookMetadataService.syncBooks(clerkUser, onCoverReady);
      setBooks(synced);
      toast.success('Library synced successfully');
      lastSessionToastRef.current = 0;
    } catch (error) {
      console.error('Error syncing books:', error);
      toast.error('Failed to sync books');
    } finally {
      setIsLoading(false);
      isDriveSyncingRef.current = false;
    }
  };

  const saveSettings = async (settings: any) => {
    if (!clerkUser) {
      console.warn('Cannot save settings: User not authenticated');
      return false;
    }

    try {
      const success = await bookMetadataService.saveSettings(settings);
      if (success) {
        appLog.debug('Settings saved to cloud successfully');
      } else {
        console.warn('Failed to save settings to cloud');
      }
      return success;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  };

  const loadSettings = async (): Promise<any | null> => {
    // Use centralized auth manager instead of direct Clerk check
    const isAuthenticated = await authManager.ensureAuthenticated();
    if (!isAuthenticated) {
      appLog.debug('Authentication failed, cannot load cloud settings');
      return null;
    }

    try {
      const settings = await bookMetadataService.loadSettings();
      return settings;
    } catch (error: any) {
      if (error.message === 'UNAUTHORIZED') {
        if (Date.now() - lastSessionToastRef.current > SESSION_COOLDOWN) {
          if (isDriveSyncingRef.current) {
            toast.info('Drive syncing…');
          } else {
            toast.error('Session expired, please sign in again');
          }
          lastSessionToastRef.current = Date.now();
        }
        throw error;
      } else {
        console.error('Error loading settings:', error);
        // Don't show error toast for generic settings loading failure - just use defaults
        return null;
      }
    }
  };

  // Folder management methods
  const createFolder = async (name: string, parentId?: string) => {
    if (!clerkUser) {
      toast.error('Please sign in to create folders');
      return;
    }

    try {
      const newFolder = await bookMetadataService.createFolder(name, parentId, clerkUser);
      setFolders(current => [...current, newFolder]);
      toast.success(`Folder "${name}" created successfully`);
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Failed to create folder');
    }
  };

  const updateFolder = async (folderId: string, updates: { name?: string; parentId?: string }) => {
    if (!clerkUser) {
      toast.error('Please sign in to update folders');
      return;
    }

    try {
      const updatedFolder = await bookMetadataService.updateFolder(folderId, updates, clerkUser);
      setFolders(current =>
        current.map(folder =>
          folder.id === folderId ? updatedFolder : folder
        )
      );
      toast.success('Folder updated successfully');
    } catch (error) {
      console.error('Error updating folder:', error);
      toast.error('Failed to update folder');
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (!clerkUser) {
      toast.error('Please sign in to delete folders');
      return;
    }

    try {
      await bookMetadataService.deleteFolder(folderId, clerkUser);
      setFolders(current => current.filter(folder => folder.id !== folderId));
      toast.success('Folder deleted successfully');
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast.error('Failed to delete folder');
    }
  };

  const moveBookToFolder = async (bookId: string, folderId: string | null) => {
    if (!clerkUser) {
      toast.error('Please sign in to move books');
      return;
    }

    try {
      await bookMetadataService.moveBookToFolder(bookId, folderId, clerkUser);
      setBooks(current =>
        current.map(book =>
          book.id === bookId ? { ...book, folderId: folderId ?? undefined } : book
        )
      );
      toast.success('Book moved successfully');
    } catch (error) {
      console.error('Error moving book:', error);
      toast.error('Failed to move book');
    }
  };

  return {
    books,
    folders,
    isLoading,
    isDriveBookLoading,
    isAuthenticated: !!clerkUser && clerkLoaded,
    signIn,
    signOut,
    uploadBook,
    downloadBook,
    deleteBook,
    updateBookCover,
    getReadingProgress,
    saveReadingProgress,
    saveBookProgress,
    openCloudFolder,
    syncBooks,
    downloadBookForOffline,
    saveSettings,
    loadSettings,
    connectToGoogleDriveAndLoad, // NEW: Manual connection function 
    createFolder,
    updateFolder,
    deleteFolder,
    moveBookToFolder
  };
}

// Export both named and default to help with HMR caching issues
export { useStorageService };
export default useStorageService;
