import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useClerk, useUser } from "@clerk/clerk-react";

import type { BookMetadata, Folder, ReadingProgress } from "~/types";

import { bookCacheService } from "@features/books/services/bookCache";
import { bookMetadataService } from "@features/books/services/bookMetadata";
import { bookStorageService } from "@features/books/services/bookStorage";

import { authManager } from "@shared/services/authManager";
import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";

import { applyBooksUpdate } from "./storageService/books";
import { useOnlineStatus } from "./storageService/connectivity";
import { cacheBookForOffline, hasOfflineBooksCached, loadOfflineBooks } from "./storageService/offline";
import { createFolderActions } from "./storageService/folders";
import { handleUnauthorizedCloudSettingsLoad, loadCloudSettings, saveCloudSettings, type CloudSettings } from "./storageService/settings";
import { secureSignOut, signInWithClerk, type ClerkClient } from "./storageService/auth";

function useStorageService() {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const clerk = useClerk();

  const isOnline = useOnlineStatus();

  const [isLoading, setIsLoading] = useState(true);
  const [isDriveBookLoading, setIsDriveBookLoading] = useState(false);
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  const booksRef = useRef<BookMetadata[]>([]);
  const isRefreshingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const SESSION_COOLDOWN_MS = 30_000;
  const lastSessionToastRef = useRef(0);
  const isDriveSyncingRef = useRef(false);

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  const silentRefreshBooks = useCallback(async () => {
    if (!clerkUser || isRefreshingRef.current) return;

    try {
      isRefreshingRef.current = true;
      if (import.meta.env.DEV) appLog.debug("[useStorageService] Silent refresh starting");

      const previous = booksRef.current;

      const onCoverReady = (bookId: string, coverUrl: string) => {
        setBooks((currentBooks) =>
          currentBooks.map((book) => (book.id === bookId ? { ...book, coverUrl } : book))
        );
      };

      const userBooks = await bookMetadataService.getUserBooks(onCoverReady);

      applyBooksUpdate({
        previous,
        next: userBooks,
        setBooks,
        booksRef,
        cleanupRemoved: (removed) => bookCacheService.cleanupBlobUrls(removed),
      });
    } catch (error) {
      notifyError(error, { title: "Failed to load books from Google Drive" });
    } finally {
      isRefreshingRef.current = false;
      setIsDriveBookLoading(false);
    }
  }, [clerkUser]);

  const loadOfflineBooksIntoState = useCallback(async () => {
    await loadOfflineBooks({
      setIsLoading,
      setBooks: (next) => setBooks(next),
    });
  }, []);

  const connectToGoogleDriveAndLoad = useCallback(async () => {
    if (!clerkUser || isRefreshingRef.current) {
      if (import.meta.env.DEV) {
        appLog.debug("[useStorageService] Cannot connect: no Clerk user or already loading");
      }
      return false;
    }

    setIsLoading(true);
    setIsDriveBookLoading(true);
    isRefreshingRef.current = true;
    isDriveSyncingRef.current = true;

    try {
      const isAuthenticated = await authManager.ensureAuthenticated();
      if (!isAuthenticated) {
        notifyError("Failed to connect to Google Drive");
        return false;
      }

      const previous = booksRef.current;

      const onCoverReady = (bookId: string, coverUrl: string) => {
        setBooks((currentBooks) =>
          currentBooks.map((book) => (book.id === bookId ? { ...book, coverUrl } : book))
        );
      };

      const [userBooks, userFolders] = await Promise.all([
        bookMetadataService.getUserBooks(onCoverReady),
        bookMetadataService.getFolders(clerkUser),
      ]);

      applyBooksUpdate({
        previous,
        next: userBooks,
        setBooks,
        booksRef,
        cleanupRemoved: (removed) => bookCacheService.cleanupBlobUrls(removed),
      });
      setFolders(userFolders);

      localStorage.setItem("wasGoogleDriveConnected", "true");
      toast.success("Google Drive connected and library loaded!");
      return true;
    } catch (error) {
      notifyError(error, {
        title: "Failed to connect to Google Drive",
        description: "Showing offline books instead.",
      });
      await loadOfflineBooksIntoState();
      return false;
    } finally {
      setIsLoading(false);
      setIsDriveBookLoading(false);
      isRefreshingRef.current = false;
      isDriveSyncingRef.current = false;
    }
  }, [clerkUser, loadOfflineBooksIntoState]);

  useEffect(() => {
    // Auto-connect to Drive only on pages that need books.
    if (import.meta.env.DEV) {
      appLog.debug(
        `[useStorageService] Status: loaded=${clerkLoaded}, user=${Boolean(clerkUser)}, userId=${clerkUser?.id}`
      );
    }

    if (!clerkLoaded) return;

    setIsLoading(false);

    if (clerkUser) {
      const currentUserId = clerkUser.id;
      if (lastUserIdRef.current === currentUserId) return;

      lastUserIdRef.current = currentUserId;

      const wasGoogleClerkLogin = clerkUser.externalAccounts?.some((acc) => acc.provider.startsWith("google"));
      if (!wasGoogleClerkLogin) return;

      const currentPath = window.location.pathname;
      const needsBooks =
        currentPath === "/" || currentPath.startsWith("/vocabulary") || currentPath.startsWith("/book/");
      if (!needsBooks) return;

      // Delay slightly to avoid Clerk session-finalization races that can cause auth state churn.
      setTimeout(() => {
        void connectToGoogleDriveAndLoad();
      }, 1000);
      return;
    }

    // User is not signed in.
    if (!isOnline) {
      if (hasOfflineBooksCached()) {
        void loadOfflineBooksIntoState();
      }
      return;
    }

    // Online + unauthenticated: enforce fresh state for sign-in.
    if (books.length > 0) {
      bookCacheService.cleanupBlobUrls(books);
    }
    setBooks([]);
    setFolders([]);
    lastUserIdRef.current = null;
  }, [books, clerkLoaded, clerkUser, connectToGoogleDriveAndLoad, isOnline, loadOfflineBooksIntoState]);

  // Listen for auth state changes but don't auto-load data.
  useEffect(() => {
    if (!clerkUser) return;
    const unsubscribe = authManager.onAuthStateChange((isAuthenticated) => {
      if (import.meta.env.DEV) appLog.debug(`[useStorageService] Auth state changed: ${isAuthenticated}`);
    });
    return unsubscribe;
  }, [clerkUser]);

  // Cleanup blob URLs when component unmounts.
  useEffect(() => {
    return () => {
      if (books.length > 0) {
        bookCacheService.cleanupBlobUrls(books);
      }
    };
  }, [books]);

  const uploadBook = useCallback(
    async (
      file: File,
      meta: { title: string; fileType: string; cover?: Blob; processOCR?: boolean },
      onOCRProgress?: (progress: { page?: number; total?: number; percent?: number }) => void
    ) => {
      if (!clerkUser) {
        notifyError("Please sign in to upload books");
        return null;
      }

      try {
        const book = await bookMetadataService.uploadBook(file, meta, clerkUser, onOCRProgress);
        await connectToGoogleDriveAndLoad();
        toast.success("Book uploaded successfully to your cloud storage!");
        return book;
      } catch (error) {
        notifyError(error, { title: "Failed to upload book to cloud storage" });
        throw error;
      }
    },
    [clerkUser, connectToGoogleDriveAndLoad]
  );

  const downloadBook = useCallback(async (bookId: string, metadata: BookMetadata): Promise<Blob | null> => {
    if (!clerkUser) {
      notifyError("Please sign in to download books");
      return null;
    }

    try {
      return await bookStorageService.downloadBook(bookId, metadata);
    } catch (error) {
      notifyError(error, { title: "Failed to download book from cloud storage" });
      throw error;
    }
  }, [clerkUser]);

  const downloadBookForOffline = useCallback(
    async (meta: BookMetadata) => {
      await cacheBookForOffline({ meta, downloadBook });
    },
    [downloadBook]
  );

  const deleteBook = useCallback(
    async (id: string) => {
      if (!clerkUser) {
        notifyError("Please sign in to delete books");
        return;
      }

      setIsLoading(true);
      try {
        await bookMetadataService.deleteBook(id);
        await silentRefreshBooks();
        toast.success("Book deleted successfully");
      } catch (error) {
        notifyError(error, { title: "Failed to delete book" });
      } finally {
        setIsLoading(false);
      }
    },
    [clerkUser, silentRefreshBooks]
  );

  const updateBookCover = useCallback(
    async (bookId: string, coverFile: File) => {
      if (!clerkUser) {
        notifyError("Please sign in to update book covers");
        return;
      }

      try {
        const newCoverImageId = await bookMetadataService.updateBookCover(bookId, coverFile);
        await silentRefreshBooks();
        toast.success("Book cover updated successfully");
        return newCoverImageId;
      } catch (error) {
        notifyError(error, { title: "Failed to update book cover" });
        throw error;
      }
    },
    [clerkUser, silentRefreshBooks]
  );

  const getReadingProgress = useCallback(async (bookId: string): Promise<ReadingProgress | null> => {
    try {
      return await bookStorageService.getReadingProgress(bookId);
    } catch (error) {
      appLog.error("[useStorageService] Error getting reading progress", error);
      return null;
    }
  }, []);

  const saveReadingProgress = useCallback(async (progress: ReadingProgress) => {
    try {
      await bookStorageService.saveReadingProgress(progress);
    } catch (error) {
      appLog.error("[useStorageService] Error saving reading progress", error);
    }
  }, []);

  const saveBookProgress = useCallback(
    async (
      bookId: string,
      currentChapter: number,
      currentPosition: number = 0,
      currentPage?: number,
      totalPages?: number,
      fileType?: string,
      scrollHeight?: number,
      viewportHeight?: number
    ): Promise<void> => {
      try {
        await bookStorageService.saveBookProgress(
          bookId,
          currentChapter,
          currentPosition,
          currentPage,
          totalPages,
          fileType,
          scrollHeight,
          viewportHeight
        );
      } catch (error) {
        appLog.error("[useStorageService] Error saving book progress", error);
      }
    },
    []
  );

  const signIn = useCallback(() => {
    signInWithClerk(clerk as unknown as ClerkClient);
  }, [clerk]);

  const signOut = useCallback(async () => {
    await secureSignOut({
      clerk: clerk as unknown as ClerkClient,
      onSignedOut: () => {
        setBooks([]);
        setFolders([]);
        lastUserIdRef.current = null;
        lastSessionToastRef.current = 0;
      },
    });
  }, [clerk]);

  const openCloudFolder = useCallback(async () => {
    if (!clerkUser) {
      notifyError("Please sign in to access your cloud storage folder");
      return;
    }

    try {
      await bookMetadataService.openCloudFolder(clerkUser);
    } catch (error) {
      notifyError(error, { title: "Failed to open cloud storage folder" });
    }
  }, [clerkUser]);

  const syncBooks = useCallback(async () => {
    if (!clerkUser) {
      notifyError("Please sign in to sync your books");
      return;
    }

    setIsLoading(true);
    isDriveSyncingRef.current = true;
    try {
      const onCoverReady = (bookId: string, coverUrl: string) => {
        setBooks((current) => current.map((b) => (b.id === bookId ? { ...b, coverUrl } : b)));
      };

      const synced = await bookMetadataService.syncBooks(clerkUser, onCoverReady);
      setBooks(synced);
      booksRef.current = synced;
      toast.success("Library synced successfully");
      lastSessionToastRef.current = 0;
    } catch (error) {
      notifyError(error, { title: "Failed to sync books" });
    } finally {
      setIsLoading(false);
      isDriveSyncingRef.current = false;
    }
  }, [clerkUser]);

  const saveSettings = useCallback(
    async (settings: CloudSettings) => {
      return await saveCloudSettings({ clerkUserId: clerkUser?.id ?? null, settings });
    },
    [clerkUser?.id]
  );

  const loadSettings = useCallback(async (): Promise<CloudSettings | null> => {
    return await loadCloudSettings({
      ensureAuthenticated: authManager.ensureAuthenticated,
      onUnauthorized: () => {
        handleUnauthorizedCloudSettingsLoad({
          sessionCooldownMs: SESSION_COOLDOWN_MS,
          lastSessionToastRef,
          isDriveSyncingRef,
        });
      },
    });
  }, []);

  const folderActions = createFolderActions({
    clerkUser,
    setFolders,
    setBooks,
  });

  return {
    books,
    folders,
    isLoading,
    isDriveBookLoading,
    isAuthenticated: Boolean(clerkUser) && clerkLoaded,
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
    connectToGoogleDriveAndLoad,
    createFolder: folderActions.createFolder,
    updateFolder: folderActions.updateFolder,
    deleteFolder: folderActions.deleteFolder,
    moveBookToFolder: folderActions.moveBookToFolder,
  };
}

// Export both named and default to help with HMR caching issues
export { useStorageService };
export default useStorageService;
