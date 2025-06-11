import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { gDriveService } from '../services/gdriveService';

interface DriveState {
  isConnected: boolean;
  user: any | null;
  signIn: (prompt?: 'select_account' | 'consent' | '') => Promise<void>;
  signOut: () => void;
  listFiles: typeof gDriveService.listFiles;
  uploadFile: typeof gDriveService.uploadFile;
  downloadFile: typeof gDriveService.downloadFile;
  deleteFile: typeof gDriveService.deleteFile;
  getAppFolderId: typeof gDriveService.getAppFolderId;
}

const DriveContext = createContext<DriveState | undefined>(undefined);

export function DriveProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState<boolean>(gDriveService.isSignedIn());
  const [user, setUser] = useState<any | null>(null);

  const refreshState = useCallback(async () => {
    const signedIn = gDriveService.isSignedIn();
    setIsConnected(signedIn);
    if (signedIn) {
      try {
        const profile = await gDriveService.getUserProfile();
        setUser(profile as any);
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshState();
    const unsubscribe = gDriveService.listenToSigninStatus(refreshState);
    return () => unsubscribe();
  }, [refreshState]);

  const signIn = useCallback(async (prompt?: 'select_account' | 'consent' | '') => {
    await gDriveService.signIn(prompt);
    await refreshState();
  }, [refreshState]);

  const signOut = useCallback(() => {
    gDriveService.signOut();
    refreshState();
  }, [refreshState]);

  const value: DriveState = {
    isConnected,
    user,
    signIn,
    signOut,
    listFiles: gDriveService.listFiles.bind(gDriveService),
    uploadFile: gDriveService.uploadFile.bind(gDriveService),
    downloadFile: gDriveService.downloadFile.bind(gDriveService),
    deleteFile: gDriveService.deleteFile.bind(gDriveService),
    getAppFolderId: gDriveService.getAppFolderId.bind(gDriveService),
  };

  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrive() {
  const ctx = useContext(DriveContext);
  if (!ctx) {
    throw new Error('useDrive must be used within a DriveProvider');
  }
  return ctx;
}
