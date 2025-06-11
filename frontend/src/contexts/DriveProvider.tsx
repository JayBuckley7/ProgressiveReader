import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { gDriveService } from '../services/gdriveService';

interface DriveContextValue {
  isSignedIn: boolean;
  profile: any | null;
  signIn: (prompt?: 'select_account' | 'consent' | '') => Promise<void>;
  signOut: () => void;
  listFiles: () => Promise<any[]>;
  openFolder: () => Promise<void>;
}

const DriveContext = createContext<DriveContextValue | undefined>(undefined);

export function DriveProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(gDriveService.isSignedIn());
  const [profile, setProfile] = useState<any | null>(null);

  useEffect(() => {
    const unsubscribe = gDriveService.listenToSigninStatus(async (status) => {
      setIsSignedIn(status);
      if (status) {
        const prof = await gDriveService.getUserProfile();
        setProfile(prof);
      } else {
        setProfile(null);
      }
    });
    // fetch initial profile if already signed in
    if (gDriveService.isSignedIn()) {
      gDriveService.getUserProfile().then(setProfile);
    }
    return unsubscribe;
  }, []);

  const value: DriveContextValue = {
    isSignedIn,
    profile,
    signIn: (prompt) => gDriveService.signIn(prompt),
    signOut: () => gDriveService.signOut(),
    listFiles: () => gDriveService.listFiles(),
    openFolder: () => gDriveService.openFolder(),
  };

  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>;
}

export function useDrive(): DriveContextValue {
  const ctx = useContext(DriveContext);
  if (!ctx) throw new Error('useDrive must be used within DriveProvider');
  return ctx;
}
