import React, { createContext, useContext } from 'react';
import { useStorageService } from '@features/books/hooks/useStorageService';
import { useGoogleDrive } from '@integrations/googleDrive/hooks/useGoogleDrive';

import { BookMetadata } from '~/types';

// Combined context for all app data
type AppDataContextType = {
  // Storage service data
  books: any[];
  folders: any[];
  isLoading: boolean;
  isDriveBookLoading: boolean;
  isAuthenticated: boolean;
  syncBooks: () => Promise<void>;
  uploadBook: (file: File, meta: { title: string; fileType: string; cover?: Blob; processOCR?: boolean }, onOCRProgress?: (progress: { page?: number; total?: number; percent?: number }) => void) => Promise<BookMetadata | null>;
  deleteBook: (bookId: string) => Promise<void>;
  updateBookCover: (bookId: string, coverFile: File) => Promise<string | undefined>;
  openCloudFolder: () => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<void>;
  updateFolder: (folderId: string, updates: any) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveBookToFolder: (bookId: string, folderId: string | null) => Promise<void>;
  getReadingProgress: (bookId: string) => Promise<any>;
  saveBookProgress: (...args: any[]) => Promise<void>;
  saveSettings: (settings: any) => Promise<boolean>;
  loadSettings: () => Promise<any>;
  connectToGoogleDriveAndLoad: () => Promise<boolean>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  downloadBookForOffline: (meta: BookMetadata) => Promise<void>;
  // Google Drive data
  isDriveConnected: boolean;
  isDriveLoading: boolean;
  driveUser: any;
  driveFiles: any[];
  driveError: Error | null;
  isTokenNearExpiry: boolean;
  isRefreshing: boolean;
  fetchDriveFiles: (folderId?: string) => Promise<void>;
  uploadToDrive: (...args: any[]) => Promise<any>;
  downloadFromDrive: (fileId: string) => Promise<any>;
  deleteFromDrive: (fileId: string) => Promise<boolean>;
  getAppFolderId: () => Promise<string | null>;
  refreshToken: () => Promise<boolean>;
};

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // Only call the hooks ONCE here at the app level
  const storageData = useStorageService();
  const googleDriveData = useGoogleDrive();

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
    // Google Drive data
    isDriveConnected: googleDriveData.isDriveConnected,
    isDriveLoading: googleDriveData.isLoading,
    driveUser: googleDriveData.driveUser,
    driveFiles: googleDriveData.driveFiles,
    driveError: googleDriveData.error,
    isTokenNearExpiry: googleDriveData.isTokenNearExpiry,
    isRefreshing: googleDriveData.isRefreshing,
    fetchDriveFiles: googleDriveData.fetchDriveFiles,
    uploadToDrive: googleDriveData.uploadToDrive,
    downloadFromDrive: googleDriveData.downloadFromDrive,
    deleteFromDrive: googleDriveData.deleteFromDrive,
    getAppFolderId: googleDriveData.getAppFolderId,
    refreshToken: googleDriveData.refreshToken,
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

