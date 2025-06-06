import { useEffect, useState } from 'react';
import * as driveSync from './driveSync';

/**
 * Button UI for connecting to Google Drive and triggering sync.
 */
export function DriveButton() {
  const [connecting, set_connecting] = useState(false);
  const [connected, set_connected] = useState(driveSync.isConnected());

  useEffect(() => {
    set_connected(driveSync.isConnected());
  }, []);

  const handle_connect = async () => {
    if (connected) {
      const folder = driveSync.getFolderId();
      if (folder) {
        window.open(`https://drive.google.com/drive/u/0/folders/${folder}`);
      }
      return;
    }
    set_connecting(true);
    try {
      const wasConnected = driveSync.isConnected();
      await driveSync.init(true);
      const nowConnected = driveSync.isConnected();
      set_connected(nowConnected);

      // Reload the page after the initial successful connection
      if (!wasConnected && nowConnected) {
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
      alert('Drive connection failed');
      set_connected(false);
    } finally {
      set_connecting(false);
    }
  };

  const handle_sync = async () => {
    await driveSync.runSyncLoop();
  };

  const profile = driveSync.getUserProfile();
  const button_text = connecting
    ? 'Connecting…'
    : connected
      ? profile?.name?.split(' ')[0] || 'Connected'
      : 'Connect Drive';

  return (
    <div className="flex items-center gap-2">
      <button
        id="connect-drive-btn"
        onClick={handle_connect}
        disabled={connecting}
        className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
      >
        {button_text}
      </button>
      {connected && (
        <button
          id="btn-sync"
          onClick={handle_sync}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Sync Now
        </button>
      )}
    </div>
  );
}
