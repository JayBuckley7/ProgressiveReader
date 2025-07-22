import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { driveApiService } from '../services/driveApiService';
import { gDriveService } from '../services/gdriveService';

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string; // Drive API returns size as string
  webViewLink?: string;
  iconLink?: string;
  // Add other relevant fields from the Drive API's file resource
}

interface GoogleUserProfile {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

export interface UseGoogleDriveReturn {
  isDriveConnected: boolean;
  driveUser: GoogleUserProfile | null;
  driveFiles: GoogleDriveFile[];
  isLoading: boolean;
  error: Error | null;
  isTokenNearExpiry: boolean;
  isRefreshing: boolean;
  fetchDriveFiles: (folderId?: string) => Promise<void>;
  uploadToDrive: (
    fileName: string,
    fileBlob: Blob,
    mimeType?: string,
    folderId?: string
  ) => Promise<GoogleDriveFile | null>;
  downloadFromDrive: (fileId: string) => Promise<Blob | null>;
  deleteFromDrive: (fileId: string) => Promise<boolean>;
  getAppFolderId: () => Promise<string | null>;
  refreshToken: () => Promise<boolean>;
}

export function useGoogleDrive(): UseGoogleDriveReturn {
  const { isSignedIn: isClerkSignedIn, isLoaded: isClerkLoaded } = useUser();
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(false);
  const [driveUser, setDriveUser] = useState<GoogleUserProfile | null>(null);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false); // For async operations like fetching files
  const [error, setError] = useState<Error | null>(null);
  const [isTokenNearExpiry, setIsTokenNearExpiry] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    // Only initialize Google Drive service if user is authenticated with Clerk
    if (!isClerkLoaded || !isClerkSignedIn) {
      // Clear state when not authenticated
      setIsDriveConnected(false);
      setDriveUser(null);
      setIsTokenNearExpiry(false);
      return;
    }

    const unsubscribe = gDriveService.listenToSigninStatus(async (status) => {
      setIsDriveConnected(status);
      if (status) {
        const profile = await gDriveService.getUserProfile();
        setDriveUser(profile);
        setIsTokenNearExpiry(gDriveService.isTokenNearExpiry());
      } else {
        setDriveUser(null);
        setIsTokenNearExpiry(false);
      }
    });

    // Initialize current state only if Clerk user is authenticated
    if (gDriveService.isSignedIn()) {
      gDriveService.getUserProfile().then(setDriveUser);
      setIsTokenNearExpiry(gDriveService.isTokenNearExpiry());
      setIsDriveConnected(true);
    }

    // Check token expiry status periodically
    const tokenCheckInterval = setInterval(() => {
      if (gDriveService.isSignedIn()) {
        setIsTokenNearExpiry(gDriveService.isTokenNearExpiry());
      }
    }, 60000); // Check every minute

    return () => {
      unsubscribe();
      clearInterval(tokenCheckInterval);
    };
  }, [isClerkLoaded, isClerkSignedIn]);

  const fetchDriveFiles = useCallback(async (folderId?: string) => {
    if (!isDriveConnected) {
      setError(new Error('Google Drive not connected.'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const files = await driveApiService.listFiles(folderId);
      setDriveFiles(files as GoogleDriveFile[]);
    } catch (e: any) {
      console.error('[useGoogleDrive] Error fetching files:', e);
      setError(e);
      setDriveFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [isDriveConnected]);

  const uploadToDrive = useCallback(
    async (
      fileName: string,
      fileBlob: Blob,
      mimeType: string = fileBlob.type || 'application/octet-stream',
      folderId?: string
    ): Promise<GoogleDriveFile | null> => {
      if (!isDriveConnected) {
        setError(new Error('Google Drive not connected.'));
        return null;
      }
      setIsLoading(true);
      setError(null);
      try {
        const uploadedFile = await driveApiService.uploadFile(fileBlob, fileName, mimeType, folderId);
        if (uploadedFile) {
          // Optionally, refresh the file list
          // await fetchDriveFiles(folderId || await gDriveService.getAppFolderId()); 
          return uploadedFile as GoogleDriveFile;
        }
        return null;
      } catch (e: any) {
        console.error('[useGoogleDrive] Error uploading file:', e);
        setError(e);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [isDriveConnected, fetchDriveFiles] // Added fetchDriveFiles if auto-refresh is used
  );

  const downloadFromDrive = useCallback(
    async (fileId: string): Promise<Blob | null> => {
      if (!isDriveConnected) {
        setError(new Error('Google Drive not connected.'));
        return null;
      }
      setIsLoading(true);
      setError(null);
      try {
        const blob = await driveApiService.downloadFile(fileId);
        return blob;
      } catch (e: any) {
        console.error('[useGoogleDrive] Error downloading file:', e);
        setError(e);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [isDriveConnected]
  );

  const deleteFromDrive = useCallback(
    async (fileId: string): Promise<boolean> => {
      if (!isDriveConnected) {
        setError(new Error('Google Drive not connected.'));
        return false;
      }
      setIsLoading(true);
      setError(null);
      try {
        const success = await driveApiService.deleteFile(fileId);
        if (success) {
          // Optionally, refresh the file list
          // await fetchDriveFiles(await gDriveService.getAppFolderId());
          setDriveFiles(prevFiles => prevFiles.filter(f => f.id !== fileId));
        }
        return success;
      } catch (e: any) {
        console.error('[useGoogleDrive] Error deleting file:', e);
        setError(e);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [isDriveConnected, fetchDriveFiles] // Added fetchDriveFiles if auto-refresh is used
  );

  const getAppFolderId = useCallback(async (): Promise<string | null> => {
    if (!isDriveConnected) {
        setError(new Error('Google Drive not connected.'));
        return null;
    }
    setIsLoading(true);
    setError(null);
    try {
        const files = await driveApiService.listFiles();
        if (files.length > 0) {
            return files[0].id; // placeholder, backend handles folder logic
        }
        return null;
    } catch (e: any) {
        console.error('[useGoogleDrive] Error getting app folder ID:', e);
        setError(e);
        return null;
    } finally {
        setIsLoading(false);
    }
  }, [isDriveConnected]);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    setIsRefreshing(true);
    try {
      const success = await gDriveService.refreshToken();
      if (success) {
        setIsTokenNearExpiry(false);
        setError(null);
      }
      return success;
    } catch (e: any) {
      console.error('[useGoogleDrive] Error refreshing token:', e);
      setError(e);
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return {
    isDriveConnected,
    driveUser,
    driveFiles,
    isLoading,
    error,
    isTokenNearExpiry,
    isRefreshing,
    fetchDriveFiles,
    uploadToDrive,
    downloadFromDrive,
    deleteFromDrive,
    getAppFolderId,
    refreshToken,
  };
}
