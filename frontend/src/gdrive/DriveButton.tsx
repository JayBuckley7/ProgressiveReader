import { useEffect, useState } from 'react';
import * as driveSync from './driveSync';

/**
 * Button UI for connecting to Google Drive and triggering sync.
 */
export function DriveButton() {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(driveSync.isConnected());

  useEffect(() => {
    setConnected(driveSync.isConnected());
  }, []);

  const handleConnect = async () => {
    if (connected) {
      const folder = driveSync.getFolderId();
      if (folder) {
        window.open(`https://drive.google.com/drive/u/0/folders/${folder}`);
      }
      return;
    }
    setConnecting(true);
    try {
      const wasConnected = driveSync.isConnected();
      await driveSync.init(true);
      const nowConnected = driveSync.isConnected();
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
    await driveSync.runSyncLoop();
  };

  const profile = driveSync.getUserProfile();
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
