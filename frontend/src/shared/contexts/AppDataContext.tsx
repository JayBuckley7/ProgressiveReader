import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useStorageService } from '@features/books/hooks/useStorageService';
import { gDriveService } from '@integrations/googleDrive/gdriveService';

import type { BookMetadata, Folder, ReadingProgress } from '~/types';

function useDriveStatus(): {
  isDriveConnected: boolean;
  isTokenNearExpiry: boolean;
  isRefreshing: boolean;
  refreshToken: () => Promise<boolean>;
} {
  const [isDriveConnected, setIsDriveConnected] = useState(() => gDriveService.isSignedIn());
  const [isTokenNearExpiry, setIsTokenNearExpiry] = useState(() => gDriveService.isTokenNearExpiry());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = gDriveService.listenToSigninStatus((status) => {
      setIsDriveConnected(status);
      setIsTokenNearExpiry(status ? gDriveService.isTokenNearExpiry() : false);
    });

    // Keep token-expiry state reasonably fresh for UI warnings.
    const intervalId = window.setInterval(() => {
      if (!gDriveService.isSignedIn()) {
        setIsTokenNearExpiry(false);
        return;
      }
      setIsTokenNearExpiry(gDriveService.isTokenNearExpiry());
    }, 60_000);

    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, []);

  const refreshToken = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const ok = await gDriveService.refreshToken();
      setIsDriveConnected(gDriveService.isSignedIn());
      setIsTokenNearExpiry(gDriveService.isTokenNearExpiry());
      return ok;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return { isDriveConnected, isTokenNearExpiry, isRefreshing, refreshToken };
}

// Combined context for all app data
type AppDataContextType = {
  // Storage service data
  books: BookMetadata[];
  folders: Folder[];
  isLoading: boolean;
  isDriveBookLoading: boolean;
  isAuthenticated: boolean;
  syncBooks: () => Promise<void>;
  uploadBook: (
    file: File,
    meta: { title: string; fileType: string; cover?: Blob; processOCR?: boolean },
    onOCRProgress?: (progress: { page?: number; total?: number; percent?: number }) => void
  ) => Promise<BookMetadata | null>;
  deleteBook: (bookId: string) => Promise<void>;
  updateBookCover: (bookId: string, coverFile: File) => Promise<string | undefined>;
  openCloudFolder: () => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<void>;
  updateFolder: (folderId: string, updates: { name?: string; parentId?: string }) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveBookToFolder: (bookId: string, folderId: string | null) => Promise<void>;
  getReadingProgress: (bookId: string) => Promise<ReadingProgress | null>;
  saveBookProgress: (
    bookId: string,
    currentChapter: number,
    currentPosition?: number,
    currentPage?: number,
    totalPages?: number,
    fileType?: string,
    scrollHeight?: number,
    viewportHeight?: number
  ) => Promise<void>;
  saveSettings: (settings: any) => Promise<boolean>;
  loadSettings: () => Promise<any>;
  connectToGoogleDriveAndLoad: () => Promise<boolean>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  downloadBookForOffline: (meta: BookMetadata) => Promise<void>;

  // Google Drive status (bytes remain browser-only; backend is token bridge only).
  isDriveConnected: boolean;
  isTokenNearExpiry: boolean;
  isRefreshing: boolean;
  refreshToken: () => Promise<boolean>;
};

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // Only call the hooks ONCE here at the app level
  const storageData = useStorageService();
  const driveStatus = useDriveStatus();

  const combinedData: AppDataContextType = {
    // Storage service data
    books: storageData.books,
    folders: storageData.folders,
    isLoading: storageData.isLoading,
    isDriveBookLoading: storageData.isDriveBookLoading,
    isAuthenticated: storageData.isAuthenticated,
    syncBooks: storageData.syncBooks,
    uploadBook: storageData.uploadBook,
    deleteBook: storageData.deleteBook,
    updateBookCover: storageData.updateBookCover,
    openCloudFolder: storageData.openCloudFolder,
    createFolder: storageData.createFolder,
    updateFolder: storageData.updateFolder,
    deleteFolder: storageData.deleteFolder,
    moveBookToFolder: storageData.moveBookToFolder,
    getReadingProgress: storageData.getReadingProgress,
    saveBookProgress: storageData.saveBookProgress,
    saveSettings: storageData.saveSettings,
    loadSettings: storageData.loadSettings,
    connectToGoogleDriveAndLoad: storageData.connectToGoogleDriveAndLoad,
    signIn: storageData.signIn,
    signOut: storageData.signOut,
    downloadBookForOffline: storageData.downloadBookForOffline,

    // Google Drive status
    isDriveConnected: driveStatus.isDriveConnected,
    isTokenNearExpiry: driveStatus.isTokenNearExpiry,
    isRefreshing: driveStatus.isRefreshing,
    refreshToken: driveStatus.refreshToken,
  };

  return (
    <AppDataContext.Provider value={combinedData}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextType {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
} 
