import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useClerk, useUser } from "@clerk/clerk-react";

import type { BookMetadata, Folder, ReadingProgress } from "~/types";

import { createBookCacheService } from "@features/books/services/bookCache";
import { createBookStorageService } from "@features/books/services/bookStorage";
import { BookCoverService } from "@features/books/services/bookCovers";
import { listUserBooksFromDrive } from "@features/books/services/bookLibrary/list";
import {
  deleteBookFromDrive,
  listFoldersFromDrive,
  openCloudFolderOnDrive,
  syncBooksFromDrive,
  updateBookCoverOnDrive,
  updateBookMetadataOnDrive,
} from "@features/books/services/bookLibrary/manage";
import { uploadBookToDrive } from "@features/books/services/bookLibrary/upload";

import { appLog } from "@shared/appLog";
import { notifyError } from "@shared/utils/notify";
import { useAppDeps } from "@app/deps/AppDepsProvider";

import { applyBooksUpdate } from "./storageService/books";
import { useOnlineStatus } from "./storageService/connectivity";
import { cacheBookForOffline, hasOfflineBooksCached, loadOfflineBooks } from "./storageService/offline";
import { createFolderActions } from "./storageService/folders";
import { handleUnauthorizedCloudSettingsLoad, loadCloudSettings, saveCloudSettings, type CloudSettings } from "./storageService/settings";
import { secureSignOut, signInWithClerk, type ClerkClient } from "./storageService/auth";

function useStorageService() {
  const deps = useAppDeps();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const clerk = useClerk();

  const isOnline = useOnlineStatus();

  const bookCache = useMemo(
    () => createBookCacheService({ drive: deps.drive, driveCache: deps.driveCache }),
    [deps.drive, deps.driveCache]
  );

  const bookStorage = useMemo(
    () => createBookStorageService({ drive: deps.drive, driveCache: deps.driveCache }),
    [deps.drive, deps.driveCache]
  );

  const covers = useMemo(() => new BookCoverService(deps.backend.covers), [deps.backend.covers]);

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

      const userBooks = await listUserBooksFromDrive({ drive: deps.drive, bookCache, onCoverReady });

      applyBooksUpdate({
        previous,
        next: userBooks,
        setBooks,
        booksRef,
        cleanupRemoved: (removed) => bookCache.cleanupBlobUrls(removed),
      });
    } catch (error) {
      notifyError(error, { title: "Failed to load books from Google Drive" });
    } finally {
      isRefreshingRef.current = false;
      setIsDriveBookLoading(false);
    }
  }, [bookCache, clerkUser, deps.drive]);

  const loadOfflineBooksIntoState = useCallback(async () => {
    await loadOfflineBooks({
      setIsLoading,
      setBooks: (next) => setBooks(next),
      driveCache: deps.driveCache,
      drive: deps.drive,
    });
  }, [deps.drive, deps.driveCache]);

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
      const isAuthenticated = await deps.driveAuth.ensureAuthenticated();
      if (!isAuthenticated) {
        notifyError("Failed to connect to Google Drive");
        lastUserIdRef.current = null;
        return false;
      }

      const previous = booksRef.current;

      const onCoverReady = (bookId: string, coverUrl: string) => {
        setBooks((currentBooks) =>
          currentBooks.map((book) => (book.id === bookId ? { ...book, coverUrl } : book))
        );
      };

      const [userBooks, userFolders] = await Promise.all([
        listUserBooksFromDrive({ drive: deps.drive, bookCache, onCoverReady }),
        listFoldersFromDrive({ drive: deps.drive, driveAuth: deps.driveAuth, clerkUser }),
      ]);

      applyBooksUpdate({
        previous,
        next: userBooks,
        setBooks,
        booksRef,
        cleanupRemoved: (removed) => bookCache.cleanupBlobUrls(removed),
      });
      setFolders(userFolders);

      localStorage.setItem("wasGoogleDriveConnected", "true");
      toast.success("Google Drive connected and library loaded!");
      return true;
    } catch (error) {
      lastUserIdRef.current = null;
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
  }, [bookCache, clerkUser, deps.drive, deps.driveAuth, loadOfflineBooksIntoState]);

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

      const wasGoogleClerkLogin = clerkUser.externalAccounts?.some((acc) => acc.provider.startsWith("google"));
      if (!wasGoogleClerkLogin) return;

      const currentPath = window.location.pathname;
      const needsBooks =
        currentPath === "/" || currentPath.startsWith("/vocabulary") || currentPath.startsWith("/book/");
      if (!needsBooks) return;

      lastUserIdRef.current = currentUserId;

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
      bookCache.cleanupBlobUrls(books);
      setBooks([]);
    }
    if (folders.length > 0) {
      setFolders([]);
    }
    lastUserIdRef.current = null;
  }, [bookCache, books, clerkLoaded, clerkUser, connectToGoogleDriveAndLoad, folders.length, isOnline, loadOfflineBooksIntoState]);

  // Listen for auth state changes but don't auto-load data.
  useEffect(() => {
    if (!clerkUser) return;
    const unsubscribe = deps.driveAuth.onAuthStateChange((isAuthenticated) => {
      if (import.meta.env.DEV) appLog.debug(`[useStorageService] Auth state changed: ${isAuthenticated}`);
    });
    return unsubscribe;
  }, [clerkUser, deps.driveAuth]);

  // Cleanup blob URLs when component unmounts.
  useEffect(() => {
    return () => {
      if (books.length > 0) {
        bookCache.cleanupBlobUrls(books);
      }
    };
  }, [bookCache, books]);

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
        const book = await uploadBookToDrive({
          drive: deps.drive,
          driveAuth: deps.driveAuth,
          driveOcr: deps.backend.ocr,
          bookCache,
          bookStorage,
          file,
          meta,
          covers,
          clerkUser,
          onOCRProgress,
        });
        await connectToGoogleDriveAndLoad();
        toast.success("Book uploaded successfully to your cloud storage!");
        return book;
      } catch (error) {
        notifyError(error, { title: "Failed to upload book to cloud storage" });
        throw error;
      }
    },
    [bookCache, bookStorage, clerkUser, connectToGoogleDriveAndLoad, covers, deps.backend.ocr, deps.drive, deps.driveAuth]
  );

  const downloadBook = useCallback(async (bookId: string, metadata: BookMetadata): Promise<Blob | null> => {
    if (!clerkUser) {
      notifyError("Please sign in to download books");
      return null;
    }

    try {
      return await bookStorage.downloadBook(bookId, metadata);
    } catch (error) {
      notifyError(error, { title: "Failed to download book from cloud storage" });
      throw error;
    }
  }, [bookStorage, clerkUser]);

  const downloadBookForOffline = useCallback(
    async (meta: BookMetadata) => {
      await cacheBookForOffline({ meta, downloadBook, driveCache: deps.driveCache, drive: deps.drive });
    },
    [deps.drive, deps.driveCache, downloadBook]
  );

  const deleteBook = useCallback(
    async (id: string) => {
      if (!clerkUser) {
        notifyError("Please sign in to delete books");
        return;
      }

      setIsLoading(true);
      try {
        await deleteBookFromDrive({
          drive: deps.drive,
          driveAuth: deps.driveAuth,
          driveCache: deps.driveCache,
          bookCache,
          bookId: id,
        });
        await silentRefreshBooks();
        toast.success("Book deleted successfully");
      } catch (error) {
        notifyError(error, { title: "Failed to delete book" });
      } finally {
        setIsLoading(false);
      }
    },
    [bookCache, clerkUser, deps.drive, deps.driveAuth, deps.driveCache, silentRefreshBooks]
  );

  const updateBookCover = useCallback(
    async (bookId: string, coverFile: File) => {
      if (!clerkUser) {
        notifyError("Please sign in to update book covers");
        return;
      }

      try {
        const newCoverImageId = await updateBookCoverOnDrive({
          drive: deps.drive,
          driveAuth: deps.driveAuth,
          driveCache: deps.driveCache,
          bookCache,
          bookId,
          coverFile,
        });
        await silentRefreshBooks();
        toast.success("Book cover updated successfully");
        return newCoverImageId;
      } catch (error) {
        notifyError(error, { title: "Failed to update book cover" });
        throw error;
      }
    },
    [bookCache, clerkUser, deps.drive, deps.driveAuth, deps.driveCache, silentRefreshBooks]
  );

  const updateBookMetadata = useCallback(
    async (bookId: string, updates: { title?: string; author?: string }) => {
      if (!clerkUser) {
        notifyError("Please sign in to update book details");
        return;
      }

      try {
        await updateBookMetadataOnDrive({ drive: deps.drive, driveAuth: deps.driveAuth, bookCache, bookId, updates });
        await silentRefreshBooks();
        toast.success("Book updated successfully");
      } catch (error) {
        notifyError(error, { title: "Failed to update book" });
        throw error;
      }
    },
    [bookCache, clerkUser, deps.drive, deps.driveAuth, silentRefreshBooks]
  );

  const getReadingProgress = useCallback(async (bookId: string): Promise<ReadingProgress | null> => {
    try {
      return await bookStorage.getReadingProgress(bookId);
    } catch (error) {
      appLog.error("[useStorageService] Error getting reading progress", error);
      return null;
    }
  }, [bookStorage]);

  const saveReadingProgress = useCallback(async (progress: ReadingProgress) => {
    try {
      await bookStorage.saveReadingProgress(progress);
    } catch (error) {
      appLog.error("[useStorageService] Error saving reading progress", error);
    }
  }, [bookStorage]);

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
        await bookStorage.saveBookProgress(
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
    [bookStorage]
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
      drive: deps.drive,
      driveCache: deps.driveCache,
    });
  }, [clerk, deps.drive, deps.driveCache]);

  const openCloudFolder = useCallback(async () => {
    if (!clerkUser) {
      notifyError("Please sign in to access your cloud storage folder");
      return;
    }

    try {
      await openCloudFolderOnDrive({ drive: deps.drive, driveAuth: deps.driveAuth, clerkUser });
    } catch (error) {
      notifyError(error, { title: "Failed to open cloud storage folder" });
    }
  }, [clerkUser, deps.drive, deps.driveAuth]);

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

      const synced = await syncBooksFromDrive({ drive: deps.drive, driveAuth: deps.driveAuth, bookCache, clerkUser, onCoverReady });
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
  }, [bookCache, clerkUser, deps.drive, deps.driveAuth]);

  const saveSettings = useCallback(
    async (settings: CloudSettings) => {
      return await saveCloudSettings({ clerkUserId: clerkUser?.id ?? null, settings, drive: deps.drive });
    },
    [clerkUser?.id, deps.drive]
  );

  const loadSettings = useCallback(async (): Promise<CloudSettings | null> => {
    return await loadCloudSettings({
      // Don't pass the method reference directly (would lose `this` for class-based impls).
      ensureAuthenticated: () => deps.driveAuth.ensureAuthenticated(),
      onUnauthorized: () => {
        handleUnauthorizedCloudSettingsLoad({
          sessionCooldownMs: SESSION_COOLDOWN_MS,
          lastSessionToastRef,
          isDriveSyncingRef,
        });
      },
      drive: deps.drive,
    });
  }, [deps.drive, deps.driveAuth.ensureAuthenticated]);

  const folderActions = createFolderActions({
    clerkUser,
    drive: deps.drive,
    driveAuth: deps.driveAuth,
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
    updateBookMetadata,
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
