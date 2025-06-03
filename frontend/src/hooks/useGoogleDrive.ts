import { useState, useEffect, useCallback } from 'react';
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

interface UseGoogleDriveReturn {
  isDriveConnected: boolean;
  driveUser: GoogleUserProfile | null;
  driveFiles: GoogleDriveFile[];
  isLoading: boolean;
  error: Error | null;
  connectToDrive: (prompt?: 'select_account' | 'consent' | '') => void;
  disconnectFromDrive: () => void;
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
}

export const useGoogleDrive = (): UseGoogleDriveReturn => {
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(gDriveService.isSignedIn());
  const [driveUser, setDriveUser] = useState<GoogleUserProfile | null>(null);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false); // For async operations like fetching files
  const [error, setError] = useState<Error | null>(null);

  const updateStateFromService = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const signedIn = gDriveService.isSignedIn();
      setIsDriveConnected(signedIn);
      if (signedIn) {
        const profile = await gDriveService.getUserProfile();
        setDriveUser(profile as GoogleUserProfile | null);
        // Optionally, fetch files immediately upon connection or leave it to an explicit call
        // await fetchDriveFiles(); 
      } else {
        setDriveUser(null);
        setDriveFiles([]);
      }
    } catch (e: any) {
      console.error('[useGoogleDrive] Error updating state from service:', e);
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial check and subscription to sign-in status changes
    updateStateFromService(); // Check initial state

    const unsubscribe = gDriveService.listenToSigninStatus((isSignedIn) => {
      console.log('[useGoogleDrive] Sign-in status changed:', isSignedIn);
      setIsDriveConnected(isSignedIn);
      if (isSignedIn) {
        updateStateFromService(); // Fetch profile etc. on sign-in
      } else {
        setDriveUser(null); // Clear user data on sign-out
        setDriveFiles([]); // Clear files on sign-out
      }
    });

    return () => {
      unsubscribe();
    };
  }, [updateStateFromService]);

  const connectToDrive = useCallback((prompt?: 'select_account' | 'consent' | '') => {
    setError(null);
    // setIsLoading(true); // Optionally set loading during the sign-in attempt prompt
    // The actual loading/state change will be handled by the listener and updateStateFromService
    gDriveService.signIn(prompt);
  }, []);

  const disconnectFromDrive = useCallback(() => {
    setError(null);
    gDriveService.signOut();
    // State updates (isConnected, user) will be handled by the listener
  }, []);

  const fetchDriveFiles = useCallback(async (folderId?: string) => {
    if (!isDriveConnected) {
      setError(new Error('Google Drive not connected.'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const files = await gDriveService.listFiles(folderId);
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
        const uploadedFile = await gDriveService.uploadFile(fileName, fileBlob, mimeType, folderId);
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
        const blob = await gDriveService.downloadFile(fileId);
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
        const success = await gDriveService.deleteFile(fileId);
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
        const id = await gDriveService.getAppFolderId();
        return id;
    } catch (e: any) {
        console.error('[useGoogleDrive] Error getting app folder ID:', e);
        setError(e);
        return null;
    } finally {
        setIsLoading(false);
    }
  }, [isDriveConnected]);

  return {
    isDriveConnected,
    driveUser,
    driveFiles,
    isLoading,
    error,
    connectToDrive,
    disconnectFromDrive,
    fetchDriveFiles,
    uploadToDrive,
    downloadFromDrive,
    deleteFromDrive,
    getAppFolderId,
  };
}; 