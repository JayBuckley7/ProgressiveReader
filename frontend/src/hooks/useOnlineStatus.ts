import { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';

export function useOnlineStatus() {
  const { settings } = useSettings();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (settings?.forceOffline) {
    return false;
  }

  return isOnline;
}

