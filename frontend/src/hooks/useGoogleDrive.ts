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
  is_drive_connected: boolean;
  drive_user: GoogleUserProfile | null;
  drive_files: GoogleDriveFile[];
  is_loading: boolean;
  error: Error | null;
  connect_to_drive: (prompt?: 'select_account' | 'consent' | '') => void;
  disconnect_from_drive: () => void;
  fetch_drive_files: (folderId?: string) => Promise<void>;
  upload_to_drive: (
    fileName: string,
    fileBlob: Blob,
    mimeType?: string,
    folderId?: string
  ) => Promise<GoogleDriveFile | null>;
  download_from_drive: (fileId: string) => Promise<Blob | null>;
  delete_from_drive: (fileId: string) => Promise<boolean>;
  get_app_folder_id: () => Promise<string | null>;
}

export const useGoogleDrive = (): UseGoogleDriveReturn => {
  const [is_drive_connected, set_is_drive_connected] = useState<boolean>(gDriveService.isSignedIn());
  const [drive_user, set_drive_user] = useState<GoogleUserProfile | null>(null);
  const [drive_files, set_drive_files] = useState<GoogleDriveFile[]>([]);
  const [is_loading, set_is_loading] = useState<boolean>(false); // For async operations like fetching files
  const [error, setError] = useState<Error | null>(null);

  const updateStateFromService = useCallback(async () => {
    set_is_loading(true);
    setError(null);
    try {
      const signedIn = gDriveService.isSignedIn();
      set_is_drive_connected(signedIn);
      if (signedIn) {
        const profile = await gDriveService.getUserProfile();
        set_drive_user(profile as GoogleUserProfile | null);
        // Optionally, fetch files immediately upon connection or leave it to an explicit call
        // await fetch_drive_files(); 
      } else {
        set_drive_user(null);
        set_drive_files([]);
      }
    } catch (e: any) {
      console.error('[useGoogleDrive] Error updating state from service:', e);
      setError(e);
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    // Initial check and subscription to sign-in status changes
    updateStateFromService(); // Check initial state

    const unsubscribe = gDriveService.listenToSigninStatus((isSignedIn) => {
      console.log('[useGoogleDrive] Sign-in status changed:', isSignedIn);
      set_is_drive_connected(isSignedIn);
      if (isSignedIn) {
        updateStateFromService(); // Fetch profile etc. on sign-in
      } else {
        set_drive_user(null); // Clear user data on sign-out
        set_drive_files([]); // Clear files on sign-out
      }
    });

    return () => {
      unsubscribe();
    };
  }, [updateStateFromService]);

  const connect_to_drive = useCallback((prompt?: 'select_account' | 'consent' | '') => {
    setError(null);
    // set_is_loading(true); // Optionally set loading during the sign-in attempt prompt
    // The actual loading/state change will be handled by the listener and updateStateFromService
    gDriveService.signIn(prompt);
  }, []);

  const disconnect_from_drive = useCallback(() => {
    setError(null);
    gDriveService.signOut();
    // State updates (isConnected, user) will be handled by the listener
  }, []);

  const fetch_drive_files = useCallback(async (folderId?: string) => {
    if (!is_drive_connected) {
      setError(new Error('Google Drive not connected.'));
      return;
    }
    set_is_loading(true);
    setError(null);
    try {
      const files = await gDriveService.listFiles(folderId);
      set_drive_files(files as GoogleDriveFile[]);
    } catch (e: any) {
      console.error('[useGoogleDrive] Error fetching files:', e);
      setError(e);
      set_drive_files([]);
    } finally {
      set_is_loading(false);
    }
  }, [is_drive_connected]);

  const upload_to_drive = useCallback(
    async (
      fileName: string,
      fileBlob: Blob,
      mimeType: string = fileBlob.type || 'application/octet-stream',
      folderId?: string
    ): Promise<GoogleDriveFile | null> => {
      if (!is_drive_connected) {
        setError(new Error('Google Drive not connected.'));
        return null;
      }
      set_is_loading(true);
      setError(null);
      try {
        const uploadedFile = await gDriveService.uploadFile(fileName, fileBlob, mimeType, folderId);
        if (uploadedFile) {
          // Optionally, refresh the file list
          // await fetch_drive_files(folderId || await gDriveService.get_app_folder_id()); 
          return uploadedFile as GoogleDriveFile;
        }
        return null;
      } catch (e: any) {
        console.error('[useGoogleDrive] Error uploading file:', e);
        setError(e);
        return null;
      } finally {
        set_is_loading(false);
      }
    },
    [is_drive_connected, fetch_drive_files] // Added fetch_drive_files if auto-refresh is used
  );

  const download_from_drive = useCallback(
    async (fileId: string): Promise<Blob | null> => {
      if (!is_drive_connected) {
        setError(new Error('Google Drive not connected.'));
        return null;
      }
      set_is_loading(true);
      setError(null);
      try {
        const blob = await gDriveService.downloadFile(fileId);
        return blob;
      } catch (e: any) {
        console.error('[useGoogleDrive] Error downloading file:', e);
        setError(e);
        return null;
      } finally {
        set_is_loading(false);
      }
    },
    [is_drive_connected]
  );

  const delete_from_drive = useCallback(
    async (fileId: string): Promise<boolean> => {
      if (!is_drive_connected) {
        setError(new Error('Google Drive not connected.'));
        return false;
      }
      set_is_loading(true);
      setError(null);
      try {
        const success = await gDriveService.deleteFile(fileId);
        if (success) {
          // Optionally, refresh the file list
          // await fetch_drive_files(await gDriveService.get_app_folder_id());
          set_drive_files(prevFiles => prevFiles.filter(f => f.id !== fileId));
        }
        return success;
      } catch (e: any) {
        console.error('[useGoogleDrive] Error deleting file:', e);
        setError(e);
        return false;
      } finally {
        set_is_loading(false);
      }
    },
    [is_drive_connected, fetch_drive_files] // Added fetch_drive_files if auto-refresh is used
  );

  const get_app_folder_id = useCallback(async (): Promise<string | null> => {
    if (!is_drive_connected) {
        setError(new Error('Google Drive not connected.'));
        return null;
    }
    set_is_loading(true);
    setError(null);
    try {
        const id = await gDriveService.getAppFolderId();
        return id;
    } catch (e: any) {
        console.error('[useGoogleDrive] Error getting app folder ID:', e);
        setError(e);
        return null;
    } finally {
        set_is_loading(false);
    }
  }, [is_drive_connected]);

  return {
    is_drive_connected,
    drive_user,
    drive_files,
    is_loading,
    error,
    connect_to_drive,
    disconnect_from_drive,
    fetch_drive_files,
    upload_to_drive,
    download_from_drive,
    delete_from_drive,
    get_app_folder_id,
  };
}; 