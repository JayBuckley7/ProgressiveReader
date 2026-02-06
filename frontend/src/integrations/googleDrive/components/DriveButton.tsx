import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { authManager } from '@shared/services/authManager';
import { appLog } from '@shared/appLog'

/**
 * Button UI for connecting to Google Drive and triggering sync.
 */
export function DriveButton() {
  const { isSignedIn: isClerkSignedIn, isLoaded: isClerkLoaded } = useUser();
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [profile, setProfile] = useState<any | null>(null);

  useEffect(() => {
    // Only check Google Drive status if Clerk user is authenticated
    if (!isClerkLoaded || !isClerkSignedIn) {
      setConnected(false);
      setProfile(null);
      return;
    }

    // Use centralized auth manager to check connection status
    const unsubscribe = authManager.onAuthStateChange((isAuthenticated) => {
      setConnected(isAuthenticated);
      // Note: Profile fetching would need to be added to authManager if needed
      setProfile(null); // Simplify for now
    });

    return unsubscribe;
  }, [isClerkLoaded, isClerkSignedIn]);

  const handleConnect = async () => {
    if (connected) {
      // TODO: Add folder opening functionality to auth manager if needed
      appLog.debug('Already connected to Google Drive');
      return;
    }
    setConnecting(true);
    try {
      const wasConnected = authManager.isAuthenticated();
      await authManager.ensureAuthenticated();
      const nowConnected = authManager.isAuthenticated();
      setConnected(nowConnected);

      // Reload the page after the initial successful connection
      if (!wasConnected && nowConnected) {
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
      alert('Drive connection failed');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    // TODO: Add sync functionality to auth manager if needed
    appLog.debug('Sync functionality not yet implemented in auth manager');
  };

  const buttonText = connecting
    ? 'Connecting…'
    : connected
      ? profile?.name?.split(' ')[0] || 'Connected'
      : 'Connect Drive';

  return (
    <div className="flex items-center gap-2">
      <button
        id="connect-drive-btn"
        onClick={handleConnect}
        disabled={connecting}
        className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
      >
        {buttonText}
      </button>
      {connected && (
        <button
          id="btn-sync"
          onClick={handleSync}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Sync Now
        </button>
      )}
    </div>
  );
}

