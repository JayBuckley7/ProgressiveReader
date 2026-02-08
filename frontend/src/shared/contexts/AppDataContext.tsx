import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useStorageService } from '@features/books/hooks/useStorageService';
import { useAppDeps } from '@app/deps/AppDepsProvider';
import type { DrivePort } from '@core/drive/ports';

import type { BookMetadata, Folder, ReadingProgress } from '~/types';

function useDriveStatus(): {
  isDriveConnected: boolean;
  isTokenNearExpiry: boolean;
  isRefreshing: boolean;
  refreshToken: () => Promise<boolean>;
} {
  const deps = useAppDeps();
  const drive: DrivePort = deps.drive;

  const [isDriveConnected, setIsDriveConnected] = useState(() => drive.isSignedIn());
  const [isTokenNearExpiry, setIsTokenNearExpiry] = useState(() => drive.isTokenNearExpiry());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = drive.listenToSigninStatus((status) => {
      setIsDriveConnected(status);
      setIsTokenNearExpiry(status ? drive.isTokenNearExpiry() : false);
    });

    // Keep token-expiry state reasonably fresh for UI warnings.
    const intervalId = window.setInterval(() => {
      if (!drive.isSignedIn()) {
        setIsTokenNearExpiry(false);
        return;
      }
      setIsTokenNearExpiry(drive.isTokenNearExpiry());
    }, 60_000);

    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [drive]);

  const refreshToken = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const ok = await drive.refreshToken();
      setIsDriveConnected(drive.isSignedIn());
      setIsTokenNearExpiry(drive.isTokenNearExpiry());
      return ok;
    } finally {
      setIsRefreshing(false);
    }
  }, [drive]);

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
  downloadBook: (bookId: string, metadata: BookMetadata) => Promise<Blob | null>;
  deleteBook: (bookId: string) => Promise<void>;
  updateBookCover: (bookId: string, coverFile: File) => Promise<string | undefined>;
  updateBookMetadata: (bookId: string, updates: { title?: string; author?: string }) => Promise<void>;
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
    downloadBook: storageData.downloadBook,
    deleteBook: storageData.deleteBook,
    updateBookCover: storageData.updateBookCover,
    updateBookMetadata: storageData.updateBookMetadata,
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
