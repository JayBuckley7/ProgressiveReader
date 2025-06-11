import { useState } from 'react';
import { useDrive } from '../contexts/DriveProvider';

/**
 * Button UI for connecting to Google Drive and triggering sync.
 */
export function DriveButton() {
  const { isSignedIn, profile, signIn, openFolder } = useDrive();
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (isSignedIn) {
      await openFolder();
      return;
    }
    setConnecting(true);
    try {
      const wasConnected = isSignedIn;
      await signIn('consent');
      if (!wasConnected && isSignedIn) {
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
      alert('Drive connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    await openFolder();
  };

  const buttonText = connecting
    ? 'Connecting…'
    : isSignedIn
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
      {isSignedIn && (
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
