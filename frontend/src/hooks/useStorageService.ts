import { useState, useEffect, useRef, useCallback } from 'react';
import { storageService, BookMetadata, ReadingProgress, Folder } from '../services/storageService';
import { gDriveService } from '../services/gdriveService';
import { authManager } from '../services/authManager';
import { addOfflineBook, getOfflineBooksWithCovers } from '../utils/offlineLibrary';
import { getCoverForFile, getCachedCover, cacheCoverForFile, cacheCover } from '../services/driveCache';
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
      console.log('[useStorageService] Silently refreshing books...');

      const previous = booksRef.current;

      const onCoverReady = (bookId: string, coverUrl: string) => {
        console.log(`[useStorageService] Cover ready for book ${bookId} (silent refresh)`);
        setBooks(currentBooks => {
          const updatedBooks = currentBooks.map(book =>
            book.id === bookId ? { ...book, coverUrl } : book
          );
          console.log(`[useStorageService] Updated books state for cover ${bookId} (silent refresh) - Total books: ${updatedBooks.length}`);
          return updatedBooks;
        });
      };

      const userBooks = await storageService.getUserBooks(onCoverReady);

      // No need to merge covers manually - storageService handles persistent URLs
      if (areBooksEqual(userBooks, previous)) {
        setBooks(userBooks);
        booksRef.current = userBooks;
      } else {
        const newIds = new Set(userBooks.map(b => b.id));
        const removed = previous.filter(b => !newIds.has(b.id));
        if (removed.length > 0) {
          storageService.cleanupBlobUrls(removed);
        }
        setBooks(userBooks);
        booksRef.current = userBooks;
      }

      console.log(`[useStorageService] Silent refresh complete - found ${userBooks.length} books`);
      
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
      console.log('[useStorageService] Cannot connect: no Clerk user or already loading');
      return false;
    }
    
    console.log('[useStorageService] 🔐 User requested Google Drive connection - starting auth sequence...');
    setIsLoading(true);
    setIsDriveBookLoading(true);
    isRefreshingRef.current = true;
    isDriveSyncingRef.current = true;
    
    try {
      // Step 1: Authenticate FIRST
      console.log('[useStorageService] Step 1: Authenticating with Google Drive...');
      const isAuthenticated = await authManager.ensureAuthenticated();
      if (!isAuthenticated) {
        console.log('[useStorageService] ❌ Authentication failed');
        toast.error('Failed to connect to Google Drive');
        return false;
      }
      console.log('[useStorageService] ✅ Google Drive authenticated successfully');

      // Step 2: Load data AFTER authentication
      console.log('[useStorageService] Step 2: Loading your books and folders...');
      const previous = booksRef.current;

      const onCoverReady = (bookId: string, coverUrl: string) => {
        console.log(`[useStorageService] Cover ready for book ${bookId}`);
        setBooks(currentBooks => {
          const updatedBooks = currentBooks.map(book =>
            book.id === bookId ? { ...book, coverUrl } : book
          );
          console.log(`[useStorageService] Updated books state for cover ${bookId} - Total books: ${updatedBooks.length}`);
          return updatedBooks;
        });
      };

      const [userBooks, userFolders] = await Promise.all([
        storageService.getUserBooks(onCoverReady),
        storageService.getFolders(clerkUser)
      ]);

      console.log(`[useStorageService] ✅ Loaded ${userBooks.length} books and ${userFolders.length} folders`);
      
      if (areBooksEqual(userBooks, previous)) {
        setBooks(userBooks);
        booksRef.current = userBooks;
      } else {
        const newIds = new Set(userBooks.map(b => b.id));
        const removed = previous.filter(b => !newIds.has(b.id));
        if (removed.length > 0) {
          storageService.cleanupBlobUrls(removed);
        }
        setBooks(userBooks);
        booksRef.current = userBooks;
      }

      setFolders(userFolders);
      toast.success('Google Drive connected and library loaded!');
      return true;
    } catch (error) {
      console.error('[useStorageService] ❌ Error during Google Drive connection:', error);
      toast.error('Failed to load your Google Drive library');
      setBooks([]);
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

  useEffect(() => {
    // DON'T try to authenticate immediately - wait for user to actually need Google Drive
    if (clerkLoaded) {
      setIsLoading(false);
      if (clerkUser) {
        // Check if this is a different user to avoid redundant loads
        const currentUserId = clerkUser.id;
        if (lastUserIdRef.current !== currentUserId) {
          console.log('User signed in with Clerk:', clerkUser);
          lastUserIdRef.current = currentUserId;
          
          // SIMPLE: Just set up the auth listener, don't authenticate yet
          // Let the user trigger authentication when they actually need it
          console.log('[useStorageService] Clerk ready, setting up auth listener but NOT auto-authenticating');
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
        authManager.signOut();

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

  // Listen for authentication state changes but DON'T auto-load data
  useEffect(() => {
    if (!clerkUser) return;

    console.log('[useStorageService] Setting up auth listener (manual mode - no auto-loading)...');

    const unsubscribe = authManager.onAuthStateChange((isAuthenticated) => {
      console.log(`[useStorageService] Auth state changed: ${isAuthenticated}`);
      // Just log the state change, don't auto-load anything
      // The user will manually trigger connectToGoogleDriveAndLoad when they want to
    });

    return () => {
      console.log('[useStorageService] Cleaning up auth listener');
      unsubscribe();
    };
  }, [clerkUser?.id]);

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
    try {
      return await storageService.getReadingProgress(bookId);
    } catch (error) {
      console.error('Error getting reading progress:', error);
      return null;
    }
  };

  const saveReadingProgress = async (progress: ReadingProgress) => {
    try {
      await storageService.saveReadingProgress(progress);
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
      await storageService.saveBookProgress(bookId, currentChapter, currentPosition, currentPage, totalPages, fileType);
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
    isDriveSyncingRef.current = true;
    try {
      const onCoverReady = (bookId: string, coverUrl: string) => {
        console.log(`[useStorageService] Cover ready for book ${bookId} (sync) - URL: ${coverUrl.substring(0, 50)}...`);
        setBooks((current) => {
          const updatedBooks = current.map((b) => (b.id === bookId ? { ...b, coverUrl } : b));
          console.log(`[useStorageService] Updated books state for cover ${bookId} (sync) - Total books: ${updatedBooks.length}`);
          return updatedBooks;
        });
      };

      const synced = await storageService.syncBooks(clerkUser, onCoverReady);
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
      const success = await storageService.saveSettings(settings);
      if (success) {
        console.log('Settings saved to cloud successfully');
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
      console.log('Authentication failed, cannot load cloud settings');
      return null;
    }

    try {
      const settings = await storageService.loadSettings();
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
      const newFolder = await storageService.createFolder(name, parentId, clerkUser);
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
      const updatedFolder = await storageService.updateFolder(folderId, updates, clerkUser);
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
      await storageService.deleteFolder(folderId, clerkUser);
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
      await storageService.moveBookToFolder(bookId, folderId, clerkUser);
      setBooks(current => 
        current.map(book => 
          book.id === bookId ? { ...book, folderId } : book
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
